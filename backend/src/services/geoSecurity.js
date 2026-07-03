import axios from 'axios';
import { appendLog } from '../data/auditLog.js';
import { extractIp } from '../utils/validation.js';

const GEO_LOOKUP_ENABLED = String(process.env.SECURITY_GEO_ENABLED || 'false').toLowerCase() === 'true';
const GEO_ENFORCE = String(process.env.SECURITY_GEO_ENFORCE || 'false').toLowerCase() === 'true';
const GEO_TIMEOUT_MS = Number(process.env.SECURITY_GEO_TIMEOUT_MS || 3500);
const GEO_CACHE_TTL_MS = Number(process.env.SECURITY_GEO_CACHE_TTL_MS || 12 * 60 * 60 * 1000);
const GEO_ALLOWED_COUNTRIES = String(process.env.SECURITY_ALLOWED_COUNTRIES || 'BR')
  .split(',')
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);
const GEO_ALLOWED_IPS = String(process.env.SECURITY_ALLOWED_IPS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const lookupCache = new Map();

function isIpv4(ip) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
}

function ipv4ToInt(ip) {
  return ip.split('.').reduce((total, octet) => (total << 8) + Number(octet), 0) >>> 0;
}

function matchesIpv4Cidr(ip, cidr) {
  if (!isIpv4(ip)) return false;
  const [baseIp, maskRaw] = cidr.split('/');
  if (!isIpv4(baseIp)) return false;
  const maskBits = Number(maskRaw);
  if (!Number.isInteger(maskBits) || maskBits < 0 || maskBits > 32) return false;
  const mask = maskBits === 0 ? 0 : (~((1 << (32 - maskBits)) - 1)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(baseIp) & mask);
}

function isIpAllowedByRule(ip, rule) {
  if (!rule) return false;
  if (rule.includes('/')) return matchesIpv4Cidr(ip, rule);
  return ip === rule;
}

export function isPrivateOrLocalIp(ip) {
  if (!ip || ip === 'unknown') return true;
  const normalized = String(ip).trim().toLowerCase();
  const isPrivate172 = /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized);
  if (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === 'localhost' ||
    normalized.startsWith('10.') ||
    normalized.startsWith('192.168.') ||
    isPrivate172 ||
    normalized.startsWith('169.254.') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  ) {
    return true;
  }
  return GEO_ALLOWED_IPS.some((rule) => isIpAllowedByRule(normalized, rule));
}

async function lookupGeo(ip) {
  if (!GEO_LOOKUP_ENABLED || isPrivateOrLocalIp(ip)) {
    return {
      ip,
      success: true,
      source: 'local',
      countryCode: 'LOCAL',
      countryName: 'Rede interna',
      regionName: 'Rede interna',
      cityName: 'Rede interna',
    };
  }

  const cached = lookupCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const { data } = await axios.get(`https://ipwho.is/${encodeURIComponent(ip)}`, {
    timeout: GEO_TIMEOUT_MS,
    params: {
      lang: 'pt-BR',
      fields: 'ip,success,message,country,country_code,region,city',
    },
  });

  const value = {
    ip,
    success: data?.success !== false,
    source: 'ipwho.is',
    countryCode: typeof data?.country_code === 'string' ? data.country_code.toUpperCase() : null,
    countryName: typeof data?.country === 'string' ? data.country : null,
    regionName: typeof data?.region === 'string' ? data.region : null,
    cityName: typeof data?.city === 'string' ? data.city : null,
    message: data?.message || null,
  };
  lookupCache.set(ip, { value, expiresAt: Date.now() + GEO_CACHE_TTL_MS });
  return value;
}

export async function buildRequestSecurityContext(req) {
  const ip = extractIp(req);
  const privateOrLocal = isPrivateOrLocalIp(ip);

  if (!GEO_LOOKUP_ENABLED) {
    return {
      ip,
      privateOrLocal,
      geo: {
        ip,
        success: true,
        source: 'disabled',
        countryCode: null,
        countryName: null,
        regionName: null,
        cityName: null,
        message: 'Geo security disabled',
      },
      accessAllowed: true,
      suspicious: false,
      denyReason: null,
    };
  }

  let geo = {
    ip,
    success: privateOrLocal,
    source: privateOrLocal ? 'local' : 'unresolved',
    countryCode: privateOrLocal ? 'LOCAL' : null,
    countryName: privateOrLocal ? 'Rede interna' : null,
    regionName: privateOrLocal ? 'Rede interna' : null,
    cityName: privateOrLocal ? 'Rede interna' : null,
    message: null,
  };

  if (!privateOrLocal) {
    try {
      geo = await lookupGeo(ip);
    } catch (error) {
      geo = {
        ...geo,
        success: false,
        source: 'lookup-error',
        message: error?.message || 'Falha ao resolver geolocalização',
      };
    }
  }

  const countryCode = geo.countryCode ? String(geo.countryCode).toUpperCase() : null;
  const countryAllowed = privateOrLocal || GEO_ALLOWED_COUNTRIES.length === 0 || (countryCode && GEO_ALLOWED_COUNTRIES.includes(countryCode));
  const lookupResolved = privateOrLocal || geo.success;
  const accessAllowed = countryAllowed && (lookupResolved || !GEO_ENFORCE);
  const suspicious = !privateOrLocal && (!countryAllowed || !lookupResolved);

  return {
    ip,
    privateOrLocal,
    geo,
    accessAllowed,
    suspicious,
    denyReason: accessAllowed
      ? null
      : !lookupResolved
        ? 'geolocation_unavailable'
        : `country_not_allowed:${countryCode || 'UNKNOWN'}`,
  };
}

export async function geoSecurityMiddleware(req, res, next) {
  try {
    const context = await buildRequestSecurityContext(req);
    req.securityContext = context;

    if (!GEO_LOOKUP_ENABLED) return next();

    if (context.suspicious) {
      appendLog({
        userId: null,
        userName: '',
        userEmail: '',
        action: context.accessAllowed ? 'security_geo_alert' : 'security_geo_block',
        details: {
          method: req.method,
          path: req.originalUrl || req.url,
          reason: context.denyReason || (!context.geo.success ? 'geolocation_unavailable' : `country_not_allowed:${context.geo.countryCode || 'UNKNOWN'}`),
          mode: GEO_ENFORCE ? 'enforced' : 'monitor_only',
        },
        ipAddress: context.ip,
        userAgent: req.headers?.['user-agent'] || null,
        countryCode: context.geo.countryCode,
        countryName: context.geo.countryName,
        regionName: context.geo.regionName,
        cityName: context.geo.cityName,
        createdAt: new Date().toISOString(),
      });
    }

    if (context.accessAllowed) return next();

    return res.status(403).json({
      error: 'Acesso bloqueado pela política de segurança geográfica',
      reason: context.denyReason,
    });
  } catch (error) {
    return res.status(503).json({ error: 'Falha ao validar a origem do acesso' });
  }
}

export function getSecurityContextLocation(context) {
  if (!context?.geo) return 'Local não identificado';
  const parts = [context.geo.cityName, context.geo.regionName, context.geo.countryName].filter(Boolean);
  return parts.length ? parts.join(' / ') : 'Local não identificado';
}
