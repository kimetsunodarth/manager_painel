// Documentos cadastrados (ex.: contratos SAP B1, snapshots). Persistidos em JSON; admin pode importar novos.
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import path from 'path';
import { getDataDir } from '../appRoot.js';

const dataDir = getDataDir();
const STORE_PATH = path.join(dataDir, 'documents-store.json');

function loadDocuments() {
  try {
    if (existsSync(STORE_PATH)) {
      const data = JSON.parse(readFileSync(STORE_PATH, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (_) {}
  return [];
}

let documentsCache = loadDocuments();

function saveDocuments(list) {
  writeFileSync(STORE_PATH, JSON.stringify(list, null, 2), 'utf8');
  documentsCache = list;
}

export function listDocuments() {
  return [...documentsCache];
}

/** Diretório onde os arquivos importados são salvos (por id). */
export const DOCUMENTS_FILES_DIR = path.join(dataDir, 'documents-files');

/** Adiciona documento (admin). Retorna o item criado. */
export function addDocument(arquivo, dataUpload) {
  const id = String(Date.now());
  const item = { id, arquivo, dataUpload };
  documentsCache.push(item);
  saveDocuments(documentsCache);
  return item;
}

export function getDocumentById(id) {
  return documentsCache.find((d) => d.id === id) || null;
}

/** Atualiza nome do documento (admin). */
export function updateDocument(id, { arquivo }) {
  const doc = documentsCache.find((d) => d.id === id);
  if (!doc) return null;
  if (arquivo != null) doc.arquivo = String(arquivo).trim() || doc.arquivo;
  saveDocuments(documentsCache);
  return doc;
}

/** Remove documento e arquivo em disco (admin). */
export function deleteDocument(id) {
  const idx = documentsCache.findIndex((d) => d.id === id);
  if (idx === -1) return false;
  documentsCache.splice(idx, 1);
  saveDocuments(documentsCache);
  return true;
}

/** Limpa todos os documentos e remove arquivos (admin). */
export function clearAllDocuments() {
  const list = [...documentsCache];
  for (const doc of list) {
    const filePath = path.join(DOCUMENTS_FILES_DIR, doc.id);
    if (existsSync(filePath)) {
      try { unlinkSync(filePath); } catch (_) {}
    }
  }
  documentsCache = [];
  saveDocuments(documentsCache);
  return true;
}
