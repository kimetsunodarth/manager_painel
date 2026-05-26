# coding: utf-8
"""Gerador de documentação PDF do FinOps Dashboard."""

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate
from reportlab.lib.colors import HexColor
from reportlab.pdfbase.pdfmetrics import stringWidth
import datetime
import os
from pathlib import Path

# ── Cores — padrão Ananim Cloud ───────────────────────────────────────────────
CYAN       = HexColor('#00d4ff')   # cyan primário (accent)
CYAN_ESC   = HexColor('#0891b2')   # cyan escuro
DARK_BG    = HexColor('#050913')   # fundo escuro (capa/header)
DARK_CARD  = HexColor('#0d1b2e')   # fundo card
AZUL       = HexColor('#00d4ff')
AZUL_ESC   = HexColor('#050913')
CINZA_ESC  = HexColor('#1e293b')   # texto escuro legível no branco
CINZA_MED  = HexColor('#64748b')   # texto secundário
CINZA_LIG  = HexColor('#f8fafc')   # linhas alternadas tabela (quase branco)
VERDE      = HexColor('#059669')
LARANJA    = HexColor('#d97706')
VERMELHO   = HexColor('#dc2626')
BRANCO     = HexColor('#ffffff')
AZUL_LIG   = HexColor('#e0f7ff')   # fundo info-box (azul bem claro)
AZUL_HDR   = HexColor('#050913')   # header/footer das páginas

W, H = A4

# ── Estilos ────────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

def s(name, **kw):
    return ParagraphStyle(name, parent=styles['Normal'], **kw)

TITLE      = s('Title2',    fontSize=26, textColor=BRANCO,    leading=32, alignment=TA_CENTER, fontName='Helvetica-Bold')
SUBTITLE   = s('Sub',       fontSize=13, textColor=CYAN,      leading=18, alignment=TA_CENTER)
H1         = s('H1',        fontSize=16, textColor=CYAN,      leading=22, fontName='Helvetica-Bold', spaceAfter=6, spaceBefore=16)
H2         = s('H2',        fontSize=13, textColor=CYAN_ESC,  leading=18, fontName='Helvetica-Bold', spaceAfter=4, spaceBefore=12)
H3         = s('H3',        fontSize=11, textColor=CINZA_ESC, leading=15, fontName='Helvetica-Bold', spaceAfter=3, spaceBefore=8)
BODY       = s('Body',      fontSize=9,  textColor=CINZA_ESC, leading=14)
SMALL      = s('Small',     fontSize=8,  textColor=CINZA_MED, leading=12)
CODE       = s('Code',      fontSize=8,  fontName='Courier',  textColor=CYAN,      leading=13, backColor=DARK_CARD, leftIndent=10, rightIndent=10, spaceBefore=4, spaceAfter=4)
BADGE_OK   = s('BadgeOk',   fontSize=8,  textColor=VERDE,    fontName='Helvetica-Bold')
BADGE_WARN = s('BadgeWarn', fontSize=8,  textColor=LARANJA,  fontName='Helvetica-Bold')
BADGE_ERR  = s('BadgeErr',  fontSize=8,  textColor=VERMELHO, fontName='Helvetica-Bold')
TABLE_HDR  = s('TblHdr',    fontSize=8,  textColor=BRANCO,   fontName='Helvetica-Bold', alignment=TA_CENTER)
TABLE_CELL = s('TblCell',   fontSize=8,  textColor=CINZA_ESC, leading=12)
TABLE_CODE = s('TblCode',   fontSize=7.5, fontName='Courier', textColor=CYAN_ESC)

def P(text, style=BODY): return Paragraph(str(text), style)
def SP(n=6):             return Spacer(1, n)
def HR():                return HRFlowable(width='100%', thickness=0.5, color=HexColor('#e0e0e0'), spaceAfter=6, spaceBefore=6)

def section_title(text):
    return [SP(4), P(text, H1), HRFlowable(width='100%', thickness=2, color=AZUL, spaceAfter=8)]

def sub_title(text):
    return [SP(2), P(text, H2)]

def sub_sub_title(text):
    return [SP(2), P(text, H3)]

def info_box(text, color=AZUL_LIG, border=CYAN):
    body_info = ParagraphStyle('BodyInfo', parent=styles['Normal'], fontSize=9, textColor=CINZA_ESC, leading=14)
    tbl = Table([[P(text, body_info)]], colWidths=[W - 5*cm])
    tbl.setStyle(TableStyle([
        ('BACKGROUND',    (0,0), (-1,-1), color),
        ('BOX',           (0,0), (-1,-1), 1.5, border),
        ('LEFTPADDING',   (0,0), (-1,-1), 12),
        ('RIGHTPADDING',  (0,0), (-1,-1), 12),
        ('TOPPADDING',    (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
    ]))
    return [SP(4), tbl, SP(4)]

def make_table(headers, rows, col_widths=None):
    data = [[P(h, TABLE_HDR) for h in headers]]
    for row in rows:
        data.append([P(str(c), TABLE_CELL) for c in row])
    col_widths = col_widths or [(W - 4*cm) / len(headers)] * len(headers)
    tbl = Table(data, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(TableStyle([
        ('BACKGROUND',    (0,0), (-1,0),  DARK_BG),
        ('ROWBACKGROUNDS',(0,1), (-1,-1), [BRANCO, HexColor('#f0faff')]),
        ('GRID',          (0,0), (-1,-1), 0.4, HexColor('#cbd5e1')),
        ('LINEBELOW',     (0,0), (-1,0),  1.5, CYAN),
        ('VALIGN',        (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING',   (0,0), (-1,-1), 7),
        ('RIGHTPADDING',  (0,0), (-1,-1), 7),
        ('TOPPADDING',    (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    return [tbl, SP(8)]

ROOT_DIR = Path(__file__).resolve().parent
LOGOS_DIR = ROOT_DIR / 'Logos Ananim'
LOGO_PATH = str(LOGOS_DIR / 'logo Ananim_Prancheta 1 cópia 14.png')
LOGO_WHITE = str(LOGOS_DIR / 'logo Ananim_Prancheta 1 cópia 13.png')

# ── Cover page ─────────────────────────────────────────────────────────────────
def cover_page(canvas, doc):
    canvas.saveState()

    # Fundo escuro total
    canvas.setFillColor(HexColor('#050913'))
    canvas.rect(0, 0, W, H, fill=1, stroke=0)

    # Faixa central (card area) — ocupa ~38% do centro
    faixa_y     = H * 0.32
    faixa_h     = H * 0.40
    canvas.setFillColor(HexColor('#0d1b2e'))
    canvas.rect(0, faixa_y, W, faixa_h, fill=1, stroke=0)

    # Grid decorativo sutil
    canvas.setStrokeColor(HexColor('#00d4ff'))
    canvas.setLineWidth(0.25)
    canvas.setStrokeAlpha(0.05)
    for i in range(0, int(W) + 1, 50):
        canvas.line(i, 0, i, H)
    for j in range(0, int(H) + 1, 50):
        canvas.line(0, j, W, j)
    canvas.setStrokeAlpha(1)

    # ── Logo PNG (branco sobre fundo escuro) ──────────────────────────────────
    logo_size   = 120
    logo_top_y  = H * 0.80       # topo do logo (coordenada Y inferior do rect)
    logo_file   = LOGO_WHITE if os.path.exists(LOGO_WHITE) else LOGO_PATH
    try:
        canvas.drawImage(logo_file,
                         W/2 - logo_size/2,
                         logo_top_y,
                         width=logo_size, height=logo_size,
                         preserveAspectRatio=True, mask='auto')
    except Exception:
        pass

    # ── Título: "Ananim" (branco) + " Cloud" (cyan) — posicionados por largura real
    font_title  = 'Helvetica-Bold'
    size_title  = 36
    canvas.setFont(font_title, size_title)
    w_ananim    = stringWidth('Ananim', font_title, size_title)
    w_space     = stringWidth(' ', font_title, size_title)
    w_cloud     = stringWidth('Cloud', font_title, size_title)
    total_title = w_ananim + w_space + w_cloud
    x_title     = W/2 - total_title/2
    y_title     = logo_top_y - 0.55*cm      # 0.55 cm abaixo do logo

    canvas.setFillColor(BRANCO)
    canvas.drawString(x_title, y_title, 'Ananim')
    canvas.setFillColor(HexColor('#00d4ff'))
    canvas.drawString(x_title + w_ananim + w_space, y_title, 'Cloud')

    # ── "Cloud Report" ─────────────────────────────────────────────────────────
    font_sub    = 'Helvetica'
    size_sub    = 14
    y_report    = y_title - size_title * 1.4
    canvas.setFont(font_sub, size_sub)
    canvas.setFillColor(HexColor('#00d4ff'))
    canvas.drawCentredString(W/2, y_report, 'Cloud Report')

    # ── Linha separadora ───────────────────────────────────────────────────────
    y_line      = y_report - 0.55*cm
    canvas.setStrokeColor(HexColor('#00d4ff'))
    canvas.setLineWidth(1.5)
    canvas.line(2.5*cm, y_line, W - 2.5*cm, y_line)

    # ── Documentação Técnica ───────────────────────────────────────────────────
    y_doc       = y_line - 0.65*cm
    canvas.setFont('Helvetica', 11)
    canvas.setFillColor(HexColor('#4d7fa8'))
    canvas.drawCentredString(W/2, y_doc, 'Documentação Técnica da API — v1.0')

    # ── Data ────────────────────────────────────────────────────────────────────
    y_date      = y_doc - 0.8*cm
    canvas.setFont('Helvetica', 10)
    canvas.setFillColor(HexColor('#00d4ff'))
    canvas.drawCentredString(W/2, y_date, datetime.date.today().strftime('%B de %Y'))

    # ── Rodapé ─────────────────────────────────────────────────────────────────
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(HexColor('#1e3a5f'))
    canvas.drawCentredString(W/2, 1.5*cm, 'Confidencial — Uso Interno  ·  Ananim Cloud Report')

    canvas.restoreState()


def normal_page(canvas, doc):
    canvas.saveState()

    # ── Header ─────────────────────────────────────────────────────────────────
    hdr_h = 1.4*cm
    canvas.setFillColor(HexColor('#050913'))
    canvas.rect(0, H - hdr_h, W, hdr_h, fill=1, stroke=0)
    canvas.setStrokeColor(HexColor('#00d4ff'))
    canvas.setLineWidth(1.2)
    canvas.line(0, H - hdr_h, W, H - hdr_h)

    # Logo mini (versão branca)
    logo_h      = 0.85*cm
    logo_x      = 0.9*cm
    logo_y      = H - hdr_h + (hdr_h - logo_h) / 2
    logo_file   = LOGO_WHITE if os.path.exists(LOGO_WHITE) else LOGO_PATH
    try:
        canvas.drawImage(logo_file, logo_x, logo_y,
                         width=logo_h, height=logo_h,
                         preserveAspectRatio=True, mask='auto')
    except Exception:
        pass

    # Texto do header — posicionado pelo stringWidth para não sobrepor
    font_hdr    = 'Helvetica-Bold'
    size_hdr    = 8.5
    canvas.setFont(font_hdr, size_hdr)
    txt_y       = H - hdr_h/2 - size_hdr/2 + 1

    text_x      = logo_x + logo_h + 0.25*cm      # logo + gap

    w_an        = stringWidth('Ananim ', font_hdr, size_hdr)
    canvas.setFillColor(BRANCO)
    canvas.drawString(text_x, txt_y, 'Ananim ')

    canvas.setFillColor(HexColor('#00d4ff'))
    canvas.drawString(text_x + w_an, txt_y, 'Cloud Report')

    sep_x       = text_x + w_an + stringWidth('Cloud Report', font_hdr, size_hdr) + 0.2*cm
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(HexColor('#4d7fa8'))
    canvas.drawString(sep_x, txt_y, '— Documentação Técnica da API')

    canvas.setFont('Helvetica-Bold', 8)
    canvas.setFillColor(HexColor('#00d4ff'))
    canvas.drawRightString(W - 1.2*cm, txt_y, f'Página {doc.page}')

    # ── Footer ─────────────────────────────────────────────────────────────────
    ftr_h = 1.0*cm
    canvas.setFillColor(HexColor('#050913'))
    canvas.rect(0, 0, W, ftr_h, fill=1, stroke=0)
    canvas.setStrokeColor(HexColor('#00d4ff'))
    canvas.setLineWidth(0.8)
    canvas.line(0, ftr_h, W, ftr_h)

    canvas.setFont('Helvetica', 7.5)
    canvas.setFillColor(HexColor('#4d7fa8'))
    canvas.drawString(1.5*cm, 0.35*cm, 'Confidencial — Uso Interno')
    canvas.setFillColor(HexColor('#00d4ff'))
    canvas.drawRightString(W - 1.5*cm, 0.35*cm, datetime.date.today().strftime('%d/%m/%Y'))

    canvas.restoreState()

# ── Build document ─────────────────────────────────────────────────────────────
def build():
    path = r'c:\Projetos\finops\FinOps_API_Documentacao.pdf'
    doc = BaseDocTemplate(
        path, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2.5*cm, bottomMargin=2*cm,
    )
    cover_frame  = Frame(0, 0, W, H, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    normal_frame = Frame(2*cm, 1.8*cm, W-4*cm, H-3.5*cm, id='normal')
    doc.addPageTemplates([
        PageTemplate(id='cover',  frames=cover_frame,  onPage=cover_page),
        PageTemplate(id='normal', frames=normal_frame, onPage=normal_page),
    ])

    story = []

    # ── Capa (página em branco para template de capa)
    story.append(NextPageTemplate('normal'))
    story.append(FrameBreak())

    # ── Índice / Sumário manual
    story += section_title('Sumário')
    toc_items = [
        ('1', 'Visão Geral do Sistema', '3'),
        ('2', 'Arquitetura e Componentes', '4'),
        ('3', 'Autenticação e Segurança', '6'),
        ('4', 'Endpoints da API', '9'),
        ('5', 'Banco de Dados', '18'),
        ('6', 'Cache e Performance', '20'),
        ('7', 'Contas Ananim Cloud Gerenciadas', '21'),
        ('8', 'Módulos Backend', '22'),
        ('9', 'Operações Destrutivas e Auditoria', '25'),
        ('10', 'Configuração e Deployment', '26'),
    ]
    for num, title, page in toc_items:
        row = Table(
            [[P(f'{num}. {title}', BODY), P(page, ParagraphStyle('r', parent=BODY, alignment=TA_RIGHT))]],
            colWidths=[W-6*cm, 1.5*cm]
        )
        row.setStyle(TableStyle([('LINEBELOW', (0,0),(0,0), 0.3, HexColor('#e0e0e0'))]))
        story.append(row)
        story.append(SP(3))

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # 1. VISÃO GERAL
    # ══════════════════════════════════════════════════════════════════════════
    story += section_title('1. Visão Geral do Sistema')
    story += info_box(
        'O <b>Ananim Cloud Report</b> é uma plataforma web de gerenciamento financeiro e operacional '
        'para ambientes Ananim Cloud. Centraliza custos, inventário, backups, quotas e operações '
        'de manutenção de <b>4 contas Ananim Cloud</b> em uma única interface segura.'
    )
    story += sub_title('Finalidade')
    bullets = [
        '<b>Controle de Custos (BSS)</b>: Visualização de gastos por conta, serviço, projeto, região e tag.',
        '<b>Inventário</b>: Listagem de todos os recursos (ECS, EIP, EVS, VPN, OBS) com detecção de ociosos.',
        '<b>Backup / CBR</b>: Gestão de vaults, políticas de backup e remoção de backups órfãos.',
        '<b>Manutenção</b>: Exclusão segura de EIPs livres, volumes soltos, SGs e buckets OBS.',
        '<b>Quotas</b>: Monitoramento de limites de recursos por projeto com alertas configuráveis.',
        '<b>VPN</b>: Criação e exclusão de VPN Gateways, Customer Gateways e Conexões IPSec.',
        '<b>Ferramentas</b>: Redimensionamento de VMs, migração de disco, gerenciamento de tags e OBS.',
        '<b>Auditoria</b>: Logs completos de leitura e escrita com rastreabilidade por usuário.',
    ]
    for b in bullets:
        story.append(P(f'• {b}', BODY))
        story.append(SP(3))

    story += sub_title('Tecnologias')
    story += make_table(
        ['Camada', 'Tecnologia', 'Versão'],
        [
            ['Backend', 'Python + Flask', '3.12 / 3.x'],
            ['Banco de Dados', 'SQLite (WAL mode)', 'Built-in'],
            ['Frontend', 'HTML5 + CSS3 + JavaScript vanilla', '—'],
            ['Autenticação', 'bcrypt + pyotp (TOTP)', 'Latest'],
            ['Signing API', 'SDK-HMAC-SHA256 (Huawei)', 'Manual'],
            ['SDKs Huawei', 'huaweicloudsdkbss, sdkcbr, sdkcore', 'Latest'],
            ['Cache', 'In-memory + SQLite persistente', '—'],
        ],
        col_widths=[4.5*cm, 7*cm, 3*cm]
    )
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # 2. ARQUITETURA
    # ══════════════════════════════════════════════════════════════════════════
    story += section_title('2. Arquitetura e Componentes')
    story += sub_title('Diagrama de Fluxo')
    story += info_box(
        '<b>Browser</b> → login.html → POST /api/auth/login → cookie HttpOnly<br/>'
        '<b>Browser</b> → index.html → GET /api/* (com cookie de sessão) → Flask<br/>'
        '<b>Flask</b> → before_request (auth + CSRF + rate limit) → handler → módulo Huawei<br/>'
        '<b>Módulo Huawei</b> → cache hit? → retorna / miss → API Huawei → salva cache → retorna<br/>'
        '<b>Operação destrutiva</b> → rate limit → executa → loga em action_logs → retorna'
    )
    story += sub_title('Estrutura de Arquivos')
    story += make_table(
        ['Arquivo', 'Responsabilidade'],
        [
            ['server.py', 'Rotas Flask, middleware de auth, cache persistente, rate limiting'],
            ['auth.py', 'Usuários, senhas bcrypt, sessões, TOTP/MFA, lockout'],
            ['db.py', 'Banco SQLite: action_logs, sessions, api_cache, users, read_logs'],
            ['config.py', 'Contas, credenciais AK/SK, descriptografia AES-256-GCM'],
            ['huawei_bss.py', 'Billing (BSS): custos por período, serviço, tag, região'],
            ['huawei_cbr.py', 'Backup (CBR): vaults, políticas, backups, imagens IMS'],
            ['huawei_inventory.py', 'Inventário: ECS, EIP, EVS, VPN, SG, OBS'],
            ['huawei_manutencao.py', 'Operações destrutivas com auditoria completa'],
            ['huawei_obs.py', 'Object Storage: buckets, objetos, upload/delete'],
            ['huawei_quota.py', 'Quotas: ECS/EVS/VPC limits por projeto'],
            ['huawei_ces.py', 'Cloud Eye: métricas de bandwidth (EIP, NAT)'],
            ['huawei_vpn.py', 'VPN: gateways, customer gateways, conexões IPSec (API v5 e Classic v2.0)'],
            ['run.py', 'Entry point: inicializa DB, admin padrão, inicia Flask'],
        ],
        col_widths=[5.5*cm, 9*cm]
    )

    story += sub_title('Módulos Frontend (tools/)')
    story += make_table(
        ['URL', 'Ferramenta'],
        [
            ['/tools/manutencao', 'Manutenção Cloud: EIPs, volumes, SGs, Vault/CBR, OBS, logs'],
            ['/tools/quota', 'Quotas de Recursos: ECS/EVS/VPC por projeto com alertas'],
            ['/tools/changedisk', 'Mudanca de Tipo de Disco (EVS retype)'],
            ['/tools/listflavor', 'Comparativo e Resize de Flavors (VM)'],
            ['/tools/tags', 'Gerenciador de Tags em lote com import/export'],
            ['/tools/obs', 'Gerenciamento de Buckets e Objetos OBS'],
            ['/tools/sapb1', 'Matriz de compatibilidade SAP Business One'],
            ['/tools/vpn', 'VPN Manager: VPN Gateways, Customer Gateways e Conexões IPSec (Classic e Enterprise)'],
        ],
        col_widths=[5*cm, 9.5*cm]
    )
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # 3. AUTENTICAÇÃO E SEGURANÇA
    # ══════════════════════════════════════════════════════════════════════════
    story += section_title('3. Autenticação e Segurança')

    story += sub_title('3.1 Fluxo de Login')
    story.append(P('O sistema usa autenticação em duas fases opcionais (2FA/MFA):', BODY))
    story.append(SP(4))
    story += make_table(
        ['Fase', 'Endpoint', 'Dados', 'Resposta'],
        [
            ['1 — Credenciais', 'POST /api/auth/login', 'username, password', 'session_token ou need_mfa=true + temp_token'],
            ['2 — MFA (opcional)', 'POST /api/auth/mfa', 'temp_token, code (6 dígitos)', 'session_token (cookie HttpOnly)'],
            ['Verificar sessão', 'GET /api/auth/me', 'Cookie finops_session', 'user info, role, mfa_enabled'],
            ['Logout', 'POST /api/auth/logout', 'Cookie finops_session', 'Apaga sessão do banco'],
        ],
        col_widths=[3.5*cm, 4.5*cm, 4*cm, 6.5*cm]
    )

    story += sub_title('3.2 Proteções Implementadas')

    story += sub_sub_title('Senhas')
    story.append(P('• Hashing com <b>bcrypt</b> (salt automático, fator de custo padrão)', BODY))
    story.append(P('• Mínimo 8 caracteres na troca de senha', BODY))
    story.append(P('• Comparação com timing-safe (não vulnerável a timing attacks)', BODY))
    story.append(SP(4))

    story += sub_sub_title('Sessões')
    story.append(P('• Token: 32 bytes criptograficamente aleatórios (<b>secrets.token_urlsafe</b>)', BODY))
    story.append(P('• Cookie: <b>HttpOnly</b> (inacessível via JavaScript) + <b>SameSite=Lax</b>', BODY))
    story.append(P('• TTL: <b>8 horas</b> com expiração hard-coded no banco', BODY))
    story.append(P('• Flag Secure: ativada quando <b>FINOPS_HTTPS=1</b>', BODY))
    story.append(SP(4))

    story += sub_sub_title('CSRF (Cross-Site Request Forgery)')
    story.append(P('• Padrão: <b>Double-Submit Cookie</b> (sem estado no servidor)', BODY))
    story.append(P('• Cookie <b>finops_csrf</b>: legível por JS (não HttpOnly)', BODY))
    story.append(P('• Header obrigatório: <b>X-CSRF-Token</b> em todos os POST/PUT/DELETE', BODY))
    story.append(P('• Validação: secrets.compare_digest() (timing-safe)', BODY))
    story.append(SP(4))

    story += sub_sub_title('Rate Limiting')
    story += make_table(
        ['Contexto', 'Limite', 'Janela'],
        [
            ['Login (por IP)', '10 tentativas', '5 minutos'],
            ['MFA (por IP)', '10 tentativas', '5 minutos'],
            ['Destrutivas — role admin', '10 operações', '60 segundos'],
            ['Destrutivas — role operator', '5 operações', '60 segundos'],
            ['Destrutivas — role analyst', '3 operações', '60 segundos'],
            ['Destrutivas — role viewer', 'Bloqueado (0)', '—'],
        ],
        col_widths=[6*cm, 4*cm, 4.5*cm]
    )

    story += sub_sub_title('Bloqueio de Conta')
    story.append(P('• Após <b>10 tentativas de login falhas</b>: conta bloqueada por <b>15 minutos</b>', BODY))
    story.append(P('• Desbloqueio automático após o tempo ou por login bem-sucedido', BODY))
    story.append(P('• Contador resetado em login bem-sucedido', BODY))
    story.append(SP(4))

    story += sub_sub_title('MFA / TOTP')
    story.append(P('• Algoritmo: <b>TOTP (Time-based One-Time Password)</b> — RFC 6238', BODY))
    story.append(P('• Compatível com: Google Authenticator, Microsoft Authenticator, Authy', BODY))
    story.append(P('• Janela de tolerância: <b>±30 segundos</b> (valid_window=1 no pyotp)', BODY))
    story.append(P('• Setup: QR Code PNG (base64) gerado pelo servidor com issuer "FinOps · Huawei Cloud"', BODY))
    story.append(SP(4))

    story += sub_sub_title('Headers de Segurança HTTP')
    story += make_table(
        ['Header', 'Valor / Política'],
        [
            ['X-Frame-Options', 'SAMEORIGIN — permite iframes da própria origem; bloqueia embedding externo'],
            ['X-Content-Type-Options', 'nosniff — bloqueia MIME-sniffing'],
            ['X-XSS-Protection', '1; mode=block — proteção XSS em browsers legados'],
            ['Referrer-Policy', 'no-referrer — não vaza URL em cabeçalhos Referer'],
            ['Permissions-Policy', 'Desativa camera, microphone, geolocation, payment'],
            ['Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"],
            ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains (apenas quando FINOPS_HTTPS=1)'],
        ],
        col_widths=[4.5*cm, 12*cm]
    )
    story.append(SP(4))

    story += sub_sub_title('Proteção XSS (Frontend)')
    story.append(P('• Função global <b>esc()</b> no JavaScript escapa todos os dados dinâmicos antes de inserir no DOM', BODY))
    story.append(P('• Tags, nomes de recursos e valores de API são sempre passados por esc() antes de usar innerHTML', BODY))
    story.append(P('• Atributos dinâmicos usam <b>data-*</b> no HTML para evitar injeção via onclick inline', BODY))
    story.append(SP(4))

    story += sub_sub_title('Validação de Upload')
    story.append(P('• Verificação de <b>magic bytes</b> (PK\\x03\\x04) — rejeita arquivos que não são XLSX reais', BODY))
    story.append(P('• Validação estrutural com <b>openpyxl.load_workbook()</b> após verificação de bytes', BODY))
    story.append(P('• CSVs exigem mínimo de 2 linhas (cabeçalho + dados)', BODY))
    story.append(SP(4))

    story += sub_sub_title('Sanitização de Logs')
    story.append(P('• Parâmetros sensíveis são mascarados antes de gravação: password, token, secret, key, ak, sk, api_key, access_key, authorization', BODY))
    story.append(P('• Valores substituídos por <b>***</b> nos logs de acesso e ação', BODY))
    story.append(SP(4))

    story += sub_sub_title('Roles de Usuário')
    story += make_table(
        ['Role', 'Permissoes'],
        [
            ['admin', 'Acesso total: leitura, escrita, operações destrutivas, gerenciamento de usuários'],
            ['operator', 'Leitura + operações destrutivas com limite menor (5 ops/min)'],
            ['analyst', 'Leitura + operações destrutivas com limite reduzido (3 ops/min)'],
            ['viewer', 'Apenas leitura (custos, inventário, quotas) — sem operações destrutivas'],
        ],
        col_widths=[3*cm, 11.5*cm]
    )

    story += sub_sub_title('Troca de Senha Obrigatória')
    story.append(P(
        'Usuários com flag <b>must_change_password=true</b> (admin novo, reset forçado) '
        'são bloqueados em todas as rotas exceto <b>/api/auth/change-password</b> até '
        'definir uma nova senha. Retorna HTTP 403 com payload <b>must_change_password: true</b>.',
        BODY
    ))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # 4. ENDPOINTS DA API
    # ══════════════════════════════════════════════════════════════════════════
    story += section_title('4. Endpoints da API')
    story += info_box(
        '<b>Base URL:</b> http://localhost:5050  |  '
        '<b>Autenticação:</b> Cookie finops_session (todas as rotas exceto /api/auth/login e /api/auth/mfa)  |  '
        '<b>CSRF:</b> Header X-CSRF-Token obrigatório em POST/PUT/DELETE'
    )

    # Auth
    story += sub_title('4.1 Autenticação (/api/auth/*)')
    story += make_table(
        ['Método', 'Rota', 'Descricao', 'Auth?'],
        [
            ['POST', '/api/auth/login', 'Login: username + password. Retorna need_mfa ou session.', 'Não'],
            ['POST', '/api/auth/mfa', 'Completa login MFA com código TOTP de 6 dígitos.', 'Não'],
            ['GET',  '/api/auth/me', 'Retorna usuario atual, role, mfa_enabled, must_change_password.', 'Sim'],
            ['POST', '/api/auth/logout', 'Encerra sessão e apaga cookie.', 'Sim'],
            ['POST', '/api/auth/change-password', 'Troca senha do usuário atual. Body: {old_password, new_password}.', 'Sim'],
            ['POST', '/api/auth/totp/setup', 'Gera secret TOTP + QR Code PNG base64.', 'Sim'],
            ['POST', '/api/auth/totp/verify', 'Confirma código TOTP e ativa MFA. Body: {code}.', 'Sim'],
            ['POST', '/api/auth/totp/disable', 'Desativa MFA do usuário atual.', 'Sim'],
        ],
        col_widths=[1.8*cm, 5*cm, 6.5*cm, 1.2*cm]
    )

    # Users
    story += sub_title('4.2 Gerenciamento de Usuários (/api/users/*)')
    story.append(P('Todas as rotas exigem role <b>admin</b>.', SMALL))
    story.append(SP(4))
    story += make_table(
        ['Método', 'Rota', 'Descricao'],
        [
            ['GET',  '/api/users', 'Lista todos os usuários (sem pass_hash).'],
            ['POST', '/api/users', 'Cria usuário. Body: {username, email, password, role}.'],
            ['POST', '/api/users/<uid>/toggle', 'Ativa/desativa conta de usuário.'],
        ],
        col_widths=[2*cm, 5*cm, 7.5*cm]
    )

    # Accounts
    story += sub_title('4.3 Contas e Custos (/api/costs/* e /api/accounts)')
    story += make_table(
        ['Método', 'Rota', 'Params', 'Descricao'],
        [
            ['GET', '/api/accounts', '—', 'Lista as 4 contas configuradas.'],
            ['GET', '/api/costs/summary', 'account, period', 'Custo total do mês (BSS).'],
            ['GET', '/api/costs/previous', 'account', 'Custo do mês anterior para comparação.'],
            ['GET', '/api/costs/history', 'account', 'Histórico 6 meses [{month, total}].'],
            ['GET', '/api/costs/by-service', 'account, period', 'Breakdown por tipo de serviço.'],
            ['GET', '/api/costs/daily', 'account, period', 'Tendência diária de custos.'],
            ['GET', '/api/costs/by-enterprise-project', 'account, period', 'Custos por projeto enterprise/centro de custo.'],
            ['GET', '/api/costs/by-project', 'account, period', 'Custos por projeto IAM.'],
            ['GET', '/api/costs/by-region', 'account, period', 'Custos por região.'],
            ['GET', '/api/costs/top-resources', 'account, period', 'Top 15 recursos mais caros.'],
            ['GET', '/api/costs/by-tag', 'account, period, tag_key', 'Custos agrupados por valor de tag.'],
            ['GET', '/api/costs/global-overview', 'period', 'Resumo paralelo de todas as 4 contas.'],
            ['GET', '/api/costs/untagged', 'account, period', 'Recursos sem tag com custo acumulado.'],
        ],
        col_widths=[1.8*cm, 5.5*cm, 3.5*cm, 5.7*cm]
    )

    story.append(PageBreak())

    # Inventory
    story += sub_title('4.4 Inventário (/api/inventory/* e /api/idle/*)')
    story += make_table(
        ['Método', 'Rota', 'Params', 'Descricao'],
        [
            ['GET', '/api/inventory/summary', 'account', 'Sumário de todos os recursos da conta (ECS, EIP, EVS, VPN...).'],
            ['GET', '/api/inventory/project', 'account, project_id', 'Detalhes do inventário de um projeto específico.'],
            ['GET', '/api/idle/full', 'account', 'Todos os recursos ociosos: EIPs livres, volumes soltos, VPNs, SGs, OBS.'],
        ],
        col_widths=[1.8*cm, 4.5*cm, 3.5*cm, 6.7*cm]
    )

    # CBR
    story += sub_title('4.5 Backup CBR (/api/cbr/* e /api/iam/*)')
    story += make_table(
        ['Método', 'Rota', 'Params', 'Descricao'],
        [
            ['GET', '/api/iam/projects', 'account', 'Lista projetos IAM da conta (filtra sa-brazil-1 e la-south-2).'],
            ['GET', '/api/cbr/vaults', 'account, project_id, project_name', 'Análise de vaults: uso, custo estimado, backups manuais.'],
        ],
        col_widths=[1.8*cm, 4.5*cm, 5*cm, 5.2*cm]
    )

    # Manutencao
    story += sub_title('4.6 Manutenção (/api/manutencao/*)')
    story += info_box('Todas as operações POST são destrutivas, exigem autenticação e são registradas em <b>action_logs</b>. Limite por role: admin=10, operator=5, analyst=3 ops/60s. Role viewer não pode executar operações destrutivas.')
    story += make_table(
        ['Método', 'Rota', 'Descricao'],
        [
            ['GET',  '/api/manutencao/idle', 'Recursos ociosos para a aba de manutenção.'],
            ['POST', '/api/manutencao/delete/eip', 'Deleta EIP desvinculado. Body: {account, project_id, eip_id, eip_name}.'],
            ['POST', '/api/manutencao/delete/volume', 'Deleta volume EVS destacado. Body: {account, project_id, volume_id}.'],
            ['POST', '/api/manutencao/delete/security-group', 'Deleta SG sem uso. Body: {account, project_id, sg_id}.'],
            ['GET',  '/api/manutencao/vault/scan', 'Varre vaults e identifica backups/recursos orfaos.'],
            ['GET',  '/api/manutencao/vault/policies', 'Lista políticas CBR de um projeto.'],
            ['POST', '/api/manutencao/vault/delete-backup', 'Deleta backup(s) CBR. Detecta e remove imagens IMS vinculadas automaticamente.'],
            ['POST', '/api/manutencao/vault/remove-resource', 'Remove recurso de vault. Limpa imagens IMS + backups vinculados se necessário.'],
            ['POST', '/api/manutencao/vault/update-policy', 'Associa política existente ou cria nova política para vault.'],
            ['POST', '/api/manutencao/vault/resize', 'Redimensiona capacidade de vault CBR. Body: {account, project_id, vault_id, region, new_size_gb}. Limites: 10–10240 GB.'],
            ['POST', '/api/manutencao/delete/obs-bucket', 'Esvazia e deleta bucket OBS.'],
        ],
        col_widths=[1.8*cm, 6*cm, 8.7*cm]
    )

    story += sub_title('4.7 Projetos IAM (/api/tools/projetos/* e /api/iam/*)')
    story += info_box(
        'Gerenciamento completo de projetos IAM por conta. Criação registra data/hora local no SQLite '
        '(API Huawei não expõe data de criação). Exclusão remove todos os recursos vinculados antes de apagar o projeto.'
    )
    story += make_table(
        ['Método', 'Rota', 'Descricao'],
        [
            ['GET',  '/api/tools/projetos', 'Lista projetos IAM da conta com datas de criação locais e quota. Param: account.'],
            ['POST', '/api/tools/projetos/create', 'Cria projeto IAM. Body: {account, name, description, target_region}. Prefixo automático com região.'],
            ['GET',  '/api/tools/projetos/<id>/scan', 'Escaneia recursos vinculados ao projeto: ECS, EVS, EIPs, SGs, vaults CBR.'],
            ['POST', '/api/tools/projetos/<id>/delete', 'Remove projeto e todos os recursos vinculados em background. Retorna task_id imediatamente.'],
        ],
        col_widths=[1.8*cm, 6.5*cm, 8.2*cm]
    )

    story += sub_title('4.8 Operações em Background (/api/tasks/*)')
    story += info_box(
        'Operações de longa duração (ex: exclusão de projeto IAM) rodam em thread separada. '
        'O endpoint retorna task_id imediatamente. O cliente faz polling em /api/tasks para acompanhar o progresso. '
        'Tasks são mantidas em memória (TTL 2h). Notificações via postMessage para o frame pai ao concluir.'
    )
    story += make_table(
        ['Método', 'Rota', 'Descricao'],
        [
            ['GET', '/api/tasks', 'Lista todas as tasks da sessão (últimas 100). Param opcional: status=running|done|error.'],
            ['GET', '/api/tasks/<task_id>', 'Detalhe de uma task específica: status, steps, error, timestamps.'],
        ],
        col_widths=[1.8*cm, 4.5*cm, 10.2*cm]
    )

    # VPN
    story += sub_title('4.9 VPN Manager (/api/vpn/*)')
    story += info_box(
        'Gerenciamento de VPN Enterprise (API v5) e VPN Classic (API v2.0 Neutron). '
        'Suporta VPN Gateways (lado Huawei), Customer Gateways (lado cliente) e Conexões IPSec. '
        'Operações de criação e exclusão são auditadas em action_logs e sujeitas a rate limit por role.'
    )
    story += make_table(
        ['Método', 'Rota', 'Descricao'],
        [
            ['GET',    '/api/vpn/overview',                   'Lista gateways, customer gateways e conexões de um projeto. Params: account, project_id, project_name.'],
            ['GET',    '/api/vpn/vpcs',                       'Lista VPCs e subnets para o form de criação de gateway. Params: account, project_id, vpc_id.'],
            ['POST',   '/api/vpn/gateways',                   'Cria VPN Gateway (Enterprise). Body: {account, project_id, name, vpc_id, connect_subnet_id, local_subnets[], flavor}.'],
            ['DELETE', '/api/vpn/gateways/<id>',              'Exclui VPN Gateway. Body: {account, project_id, project_name}.'],
            ['POST',   '/api/vpn/customer-gateways',          'Cria Customer Gateway. Body: {account, project_id, name, ip, bgp_asn?}.'],
            ['DELETE', '/api/vpn/customer-gateways/<id>',     'Exclui Customer Gateway. Body: {account, project_id}.'],
            ['POST',   '/api/vpn/connections',                'Cria Conexão VPN. Body: {account, project_id, name, vgw_id, vgw_ip, cgw_id, peer_subnets[], psk, ike_version, ike_auth, ike_enc, ipsec_auth, ipsec_enc}.'],
            ['DELETE', '/api/vpn/connections/<id>',           'Exclui Conexão VPN. Body: {account, project_id}.'],
            ['GET',    '/api/vpn/classic/overview',           'Lista serviços VPN Classic (v2.0) e conexões IPSec de um projeto.'],
            ['POST',   '/api/vpn/classic/services',          'Cria serviço VPN Classic. Body: {account, project_id, name, subnet_id, router_id}.'],
            ['DELETE', '/api/vpn/classic/services/<id>',     'Exclui serviço VPN Classic.'],
            ['POST',   '/api/vpn/classic/connections',       'Cria conexão IPSec Classic. Body: {account, project_id, name, vpnservice_id, local_ep_group_id, peer_ep_group_id, psk, peer_address}.'],
            ['DELETE', '/api/vpn/classic/connections/<id>',  'Exclui conexão IPSec Classic.'],
        ],
        col_widths=[1.8*cm, 5.5*cm, 9.2*cm]
    )

    story.append(PageBreak())

    # OBS
    story += sub_title('4.10 Object Storage OBS (/api/obs/*)')
    story += make_table(
        ['Método', 'Rota', 'Descricao'],
        [
            ['GET',  '/api/obs/buckets', 'Lista todos os buckets com tamanho, objetos, custo estimado.'],
            ['GET',  '/api/obs/objects', 'Lista objetos de um bucket. Params: account, bucket, prefix, max_keys.'],
            ['POST', '/api/obs/delete-object', 'Deleta objeto único. Body: {account, bucket, key}.'],
            ['POST', '/api/obs/empty-bucket', 'Deleta todos os objetos do bucket (em lotes).'],
            ['POST', '/api/obs/empty-and-delete', 'Esvazia e remove o bucket completamente.'],
            ['POST', '/api/obs/delete-bucket', 'Deleta bucket vazio.'],
        ],
        col_widths=[1.8*cm, 4.5*cm, 10.2*cm]
    )

    # Quotas
    story += sub_title('4.11 Quotas (/api/quota/*)')
    story += make_table(
        ['Método', 'Rota', 'Descricao'],
        [
            ['GET',  '/api/quota/projects', 'Lista projetos para o seletor de quotas.'],
            ['GET',  '/api/quota/scan', 'Coleta quotas ECS/EVS/VPC para todos os projetos em paralelo.'],
            ['GET',  '/api/quota/thresholds', 'Retorna limites de alerta salvos no banco (app_settings).'],
            ['POST', '/api/quota/thresholds', 'Salva limites de alerta. Body: {ecs_pct, evs_pct, vpc_pct}.'],
        ],
        col_widths=[1.8*cm, 4.5*cm, 10.2*cm]
    )

    # Logs
    story += sub_title('4.12 Auditoria e Logs (/api/logs/*)')
    story += make_table(
        ['Método', 'Rota', 'Descricao'],
        [
            ['GET', '/api/logs/actions', 'Logs de operações destrutivas. Filtros: account, type, limit.'],
            ['GET', '/api/logs/access', 'Logs de acesso HTTP (legacy).'],
            ['GET', '/api/logs/reads', 'Logs de leitura de API com cache_hit e duration_ms.'],
            ['GET', '/api/logs/stats', 'Estatísticas gerais: total de ops, cache hit rate, top endpoints.'],
        ],
        col_widths=[1.8*cm, 4.5*cm, 10.2*cm]
    )

    # Cache
    story += sub_title('4.13 Gerenciamento de Cache (/api/cache/*)')
    story += make_table(
        ['Método', 'Rota', 'Descricao'],
        [
            ['POST', '/api/cache/clear', 'Limpa cache. Body: {account?: "all"|account_id}. Requer admin.'],
            ['GET',  '/api/cache/stats', 'Estatísticas do cache: total de entradas, hit rate, por endpoint.'],
        ],
        col_widths=[1.8*cm, 4*cm, 11*cm]
    )

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # 5. BANCO DE DADOS
    # ══════════════════════════════════════════════════════════════════════════
    story += section_title('5. Banco de Dados (SQLite — finops.db)')
    story += info_box('Modo WAL (Write-Ahead Log) para melhor concorrência. Localização: c:\\Projetos\\finops\\finops.db')

    tabelas = [
        ('users', 'Usuários da aplicação', [
            ('id', 'INTEGER PK', 'ID autoincrement'),
            ('username', 'TEXT UNIQUE', 'Login do usuário'),
            ('email', 'TEXT UNIQUE', 'E-mail'),
            ('pass_hash', 'TEXT', 'Hash bcrypt da senha'),
            ('totp_secret', 'TEXT', 'Secret base32 para TOTP (vazio = MFA desativado)'),
            ('mfa_enabled', 'INTEGER', '1 = MFA ativo'),
            ('role', 'TEXT', 'admin | analyst | viewer'),
            ('active', 'INTEGER', '1 = conta ativa'),
            ('must_change_password', 'INTEGER', '1 = forçar troca na próximo acesso'),
            ('failed_attempts', 'INTEGER', 'Contador de falhas de login'),
            ('locked_until', 'TEXT', 'ISO datetime de desbloqueio (vazio = não bloqueado)'),
            ('last_login', 'TEXT', 'Última sessão registrada'),
        ]),
        ('sessions', 'Sessões ativas', [
            ('token', 'TEXT PK', '32 bytes URL-safe aleatórios'),
            ('user_id', 'INTEGER', 'FK para users.id'),
            ('username', 'TEXT', 'Cache do username'),
            ('role', 'TEXT', 'Cache do role no momento do login'),
            ('created_at', 'TEXT', 'Criação da sessão'),
            ('expires_at', 'TEXT', 'Expiração (TTL 8h)'),
            ('ip', 'TEXT', 'IP do cliente no login'),
            ('user_agent', 'TEXT', 'User-Agent truncado em 200 chars'),
        ]),
        ('action_logs', 'Auditoria de operações destrutivas', [
            ('id', 'INTEGER PK', 'Auto'),
            ('ts', 'TEXT', 'Timestamp ISO'),
            ('action', 'TEXT', 'delete, retype, resize, remove_resource...'),
            ('resource_type', 'TEXT', 'eip, volume, security_group, cbr_backup, obs_bucket...'),
            ('resource_id', 'TEXT', 'UUID do recurso'),
            ('resource_name', 'TEXT', 'Nome legível'),
            ('account', 'TEXT', 'ID da conta'),
            ('project', 'TEXT', 'Nome do projeto'),
            ('region', 'TEXT', 'sa-brazil-1 | la-south-2'),
            ('status', 'TEXT', 'ok | error'),
            ('details', 'TEXT', 'JSON com detalhes adicionais'),
            ('error', 'TEXT', 'Mensagem de erro se falhou'),
            ('username', 'TEXT', 'Usuário que executou'),
        ]),
        ('api_cache', 'Cache persistente de respostas da API', [
            ('cache_key', 'TEXT PK', 'MD5(endpoint + params + account)'),
            ('data', 'TEXT', 'JSON comprimido com zlib + base64'),
            ('created_at', 'TEXT', 'Quando foi criado'),
            ('expires_at', 'TEXT', 'Quando expira (TTL configurável)'),
            ('endpoint', 'TEXT', 'Endpoint que gerou o cache'),
            ('account', 'TEXT', 'Conta associada (para invalidação seletiva)'),
        ]),
        ('read_logs', 'Logs de leitura da API com métricas', [
            ('id', 'INTEGER PK', 'Auto'),
            ('ts', 'TEXT', 'Timestamp'),
            ('endpoint', 'TEXT', 'Rota acessada'),
            ('account', 'TEXT', 'Conta consultada'),
            ('username', 'TEXT', 'Usuário que consultou'),
            ('params', 'TEXT', 'JSON dos query params'),
            ('cache_hit', 'INTEGER', '1 = veio do cache, 0 = chamou API Huawei'),
            ('duration_ms', 'INTEGER', 'Tempo de resposta em ms'),
            ('ip', 'TEXT', 'IP do cliente'),
        ]),
        ('app_settings', 'Configurações da aplicação', [
            ('key', 'TEXT PK', 'Nome da configuração (ex: quota_thresholds)'),
            ('value', 'TEXT', 'Valor JSON ou string'),
        ]),
        ('iam_projects', 'Projetos IAM criados via ferramenta (data de criação local)', [
            ('project_id', 'TEXT PK', 'UUID do projeto IAM na Huawei'),
            ('project_name', 'TEXT', 'Nome completo (ex: sa-brazil-1_MeuProjeto)'),
            ('account_id', 'TEXT', 'ID interno da conta (ex: ananimcloud)'),
            ('region', 'TEXT', 'Região: sa-brazil-1 | la-south-2'),
            ('created_by', 'TEXT', 'Usuário que criou via ferramenta'),
            ('created_at', 'TEXT', 'Data/hora UTC no formato DD/MM/YYYY HH:MM'),
        ]),
    ]

    for tname, tdesc, tcols in tabelas:
        story += sub_title(f'Tabela: {tname}')
        story.append(P(tdesc, SMALL))
        story.append(SP(3))
        story += make_table(
            ['Coluna', 'Tipo', 'Descricao'],
            tcols,
            col_widths=[4*cm, 3*cm, 8.5*cm]
        )

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # 6. CACHE
    # ══════════════════════════════════════════════════════════════════════════
    story += section_title('6. Cache e Performance')
    story += sub_title('6.1 Estratégia de Dois Níveis')
    story.append(P('<b>Nível 1 — In-memory</b>: Dicionário Python por módulo. Rápido, perde ao reiniciar.', BODY))
    story.append(P('<b>Nível 2 — SQLite (api_cache)</b>: Persistente entre reinicializações. Comprimido com zlib.', BODY))
    story.append(SP(6))

    story += sub_title('6.2 TTLs por Tipo de Dado')
    story += make_table(
        ['Módulo / Dado', 'TTL', 'Justificativa'],
        [
            ['BSS — Custos', '300s (5 min)', 'Dados mudam poucas vezes por dia'],
            ['BSS — Global Overview', '600s (10 min)', 'Agrega 4 contas; mais custoso de recalcular'],
            ['CBR — Vaults', '300s (5 min)', 'Backups não mudam em segundos'],
            ['Inventário (ECS, EIP, EVS)', '180s (3 min)', 'Mais dinâmico: VMs podem ser criadas/paradas'],
            ['Quota', '300s (5 min)', 'Limites mudam raramente'],
            ['CES — Métricas bandwidth', '120s (2 min)', 'Dados em tempo real, alta volatilidade'],
            ['OBS — Buckets', '300s (5 min)', 'Storage não muda com frequência'],
            ['IAM — Projetos', '300s (5 min)', 'Lista de projetos é estável'],
        ],
        col_widths=[6*cm, 3*cm, 6.5*cm]
    )

    story += sub_title('6.3 Invalidação de Cache')
    story.append(P('• <b>Manual</b>: POST /api/cache/clear (admin) — apaga toda a tabela api_cache ou por conta.', BODY))
    story.append(P('• <b>Automática por TTL</b>: cache_cleanup() roda a cada inicialização e pode ser agendado.', BODY))
    story.append(P('• <b>In-memory</b>: não tem invalidação manual — reiniciar servidor apaga.', BODY))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # 7. CONTAS HUAWEI
    # ══════════════════════════════════════════════════════════════════════════
    story += section_title('7. Contas Ananim Cloud Gerenciadas')
    story += make_table(
        ['ID Interno', 'Nome Exibido', 'Região Padrão', 'Var. AK', 'Var. SK'],
        [
            ['ramo_sistemas', 'RAMO SISTEMAS', 'sa-brazil-1 (São Paulo)', 'RAMO_AK', 'RAMO_SK'],
            ['ananimcloud', 'ANANIMCLOUD', 'sa-brazil-1 (São Paulo)', 'ANANIM_AK', 'ANANIM_SK'],
            ['rsdone', 'RSDONE', 'la-south-2 (Santiago)', 'RSDONE_AK', 'RSDONE_SK'],
            ['moove_ramosistemas', 'MOOVE RAMO', 'sa-brazil-1 (São Paulo)', 'MOOVE_AK', 'MOOVE_SK'],
        ],
        col_widths=[4*cm, 3.5*cm, 4.5*cm, 2.5*cm, 2.5*cm]
    )

    story += sub_title('7.1 Carregamento de Credenciais')
    story.append(P('A prioridade de carregamento das credenciais (AK/SK) é:', BODY))
    story.append(SP(4))
    for i, item in enumerate([
        'Web panel <b>.env</b> (c:\\Projetos\\huawei-cloud-panel\\backend\\.env) — texto simples',
        'Web panel <b>config.enc</b> descriptografado com <b>AES-256-GCM</b> (salt 32B + IV 16B + tag 16B)',
        'Tags project <b>.env</b> (c:\\Projetos\\tags\\.env) — cifrado com <b>Fernet</b>',
        '<b>Demo mode</b>: sem credenciais — funcionalidade limitada',
    ], 1):
        story.append(P(f'{i}. {item}', BODY))
        story.append(SP(2))

    story += sub_title('7.2 Signing das APIs Huawei')
    story += info_box(
        '<b>Algoritmo</b>: SDK-HMAC-SHA256 (similar ao AWS SigV4)<br/>'
        '<b>Headers assinados</b>: host, x-sdk-date [+ content-type para POST/PUT]<br/>'
        '<b>Quirk CBR/IAM</b>: path assinado deve ter trailing slash ("/"), mesmo que a request não envie<br/>'
        '<b>Header IMS</b>: X-Project-Id obrigatório para operações em imagens<br/>'
        '<b>OBS</b>: Algoritmo diferente — HMAC-SHA1 (S3v2-compatible)'
    )
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # 8. MÓDULOS BACKEND
    # ══════════════════════════════════════════════════════════════════════════
    story += section_title('8. Módulos Backend — Referência Rápida')

    modulos = [
        ('huawei_bss.py — Billing', [
            ('get_monthly_summary(ak, sk, region, period)', 'Custo total do mês. Retorna {total_cost, currency, services[]}'),
            ('get_cost_by_service(ak, sk, region, period)', 'Breakdown por tipo de serviço ordenado por custo'),
            ('get_daily_costs(ak, sk, region, period)', 'Tendência diária [{day, cost}]'),
            ('get_top_resources(ak, sk, region, period)', 'Top 15 recursos mais caros [{name, cost, type}]'),
            ('get_cost_by_tag(ak, sk, region, period, tag_key)', 'Custos agrupados por valor da tag especificada'),
            ('get_cost_by_enterprise_project(ak, sk, region, period)', 'Custos por projeto enterprise (centro de custo)'),
        ]),
        ('huawei_cbr.py — Backup', [
            ('list_projects(ak, sk, region)', 'Projetos IAM filtrados para sa-brazil-1 e la-south-2'),
            ('get_vault_analysis(ak, sk, region, pid, pname)', 'Análise de vaults: uso, custo estimado, backups manuais'),
            ('scan_vault_orphans(ak, sk, region, pid, pname)', 'Vaults com recursos/backups orfaos + structured policy'),
            ('list_policies(ak, sk, region, pid)', 'Políticas CBR com schedules, retenção e status'),
            ('delete_backup(ak, sk, region, pid, bid)', 'Deleta backup. Auto-remove imagem IMS vinculada se necessário'),
            ('remove_vault_resource(ak, sk, region, pid, vid, rid)', 'Remove recurso de vault. Auto-limpa imagens + backups'),
            ('update_vault_policy(ak, sk, region, pid, vid, ...)', 'Associa política existente ou cria nova para vault'),
            ('resize_vault(ak, sk, region, pid, vault_id, new_size_gb)', 'Redimensiona capacidade do vault via PUT /v3/{pid}/vaults/{id}. Limites 10–10240 GB. Invalida cache após sucesso.'),
        ]),
        ('huawei_iam.py — Projetos IAM', [
            ('list_projects_detail(ak, sk, region)', 'Lista projetos IAM: filtra MOS* e regiões não gerenciadas. Tenta quota via /v3.0/OS-QUOTA/domains/{domain_id}.'),
            ('create_project(ak, sk, region, name_suffix, description, target_region)', 'Cria projeto com prefixo de região (ex: sa-brazil-1_Nome). Usa endpoint IAM da região destino.'),
            ('scan_project_resources(ak, sk, region, project_id)', 'Varre ECS, EVS, EIPs, Security Groups e Vaults CBR de um projeto. Retorna dict com listas por tipo.'),
            ('delete_project_and_resources(ak, sk, region, project_id, project_name, account_id, username, on_step)', 'Exclusão completa: ECS batch → EIPs → Volumes → SGs → Vaults → Projeto IAM. Callback on_step para progresso em tempo real.'),
            ('_delete_ecs_batch(...)', 'POST /v1/{pid}/cloudservers/delete com delete_publicip=True, delete_volume=True.'),
            ('_release_eips(...)', 'Libera EIPs desvinculados (status=DOWN). EIPs ainda vinculados são ignorados.'),
            ('_delete_volumes(...)', 'Deleta volumes available/error. Tenta API v3 com fallback para v2.'),
            ('_delete_sgs(...)', 'Deleta Security Groups exceto o grupo "default".'),
            ('_delete_vaults(...)', 'Deleta backups do vault primeiro, depois o vault em si.'),
            ('_delete_iam_project(...)', 'Tenta DELETE /v3/projects/{id}; fallback para /v3-ext/projects/{id}.'),
        ]),
        ('huawei_inventory.py — Inventário', [
            ('get_account_inventory_summary(ak, sk, region)', 'Sumário de ECS, EIP, EVS, VPN, SG por conta'),
            ('get_project_inventory(ak, sk, region, pid)', 'Inventário detalhado de um projeto'),
            ('get_full_idle_summary(ak, sk, region)', 'Todos os recursos ociosos (EIPs livres, vols, VPNs, SGs, OBS)'),
        ]),
        ('huawei_obs.py — Object Storage', [
            ('get_all_buckets_with_info(ak, sk, region)', 'Buckets com tamanho total, contagem de objetos, uso de storage'),
            ('list_objects(ak, sk, bucket, region, prefix, max_keys)', 'Lista objetos com paginação'),
            ('delete_object(ak, sk, bucket, key, region)', 'Remove objeto individual'),
            ('empty_and_delete_bucket(ak, sk, bucket, region)', 'Esvazia em lotes e deleta o bucket'),
        ]),
        ('huawei_quota.py — Quotas', [
            ('get_account_quotas(ak, sk, region, filter)', 'Quotas ECS/EVS/VPC para todos projetos da conta'),
            ('_fetch_project_quota(ak, sk, pid, pname, region)', 'Quota de um projeto específico (ECS limits, EVS quota-set, VPC quotas)'),
        ]),
        ('huawei_ces.py — Metricas', [
            ('get_eip_bandwidth_metrics(ak, sk, region, pid, eip_ids)', 'Métricas de bandwidth up/down por EIP (Cloud Eye)'),
        ]),
        ('huawei_vpn.py — VPN', [
            ('list_vpcs(ak, sk, region, pid)', 'Lista VPCs disponíveis no projeto para o formulário de criação de gateway.'),
            ('list_subnets(ak, sk, region, pid, vpc_id)', 'Lista subnets de uma VPC. vpc_id opcional para filtrar.'),
            ('list_gateways(ak, sk, region, pid)', 'Lista VPN Gateways (Enterprise v5): status, flavor, subnets locais, AZs.'),
            ('create_gateway(ak, sk, region, pid, name, vpc_id, connect_subnet, local_subnets, flavor, az_ids)', 'Cria VPN Gateway via POST /v5/{pid}/vpn-gateways. Invalida cache após sucesso.'),
            ('delete_gateway(ak, sk, region, pid, gw_id)', 'Exclui VPN Gateway via DELETE /v5/{pid}/vpn-gateways/{id}.'),
            ('list_customer_gateways(ak, sk, region, pid)', 'Lista Customer Gateways: nome, IP público, BGP ASN.'),
            ('create_customer_gateway(ak, sk, region, pid, name, ip, bgp_asn)', 'Cria Customer Gateway via POST /v5/{pid}/customer-gateways. BGP ASN opcional.'),
            ('delete_customer_gateway(ak, sk, region, pid, cgw_id)', 'Exclui Customer Gateway via DELETE /v5/{pid}/customer-gateways/{id}.'),
            ('list_connections(ak, sk, region, pid)', 'Lista conexões VPN IPSec: status, vgw_id, cgw_id, peer_subnets, IKE/IPSec policies.'),
            ('create_connection(ak, sk, region, pid, name, vgw_id, vgw_ip, cgw_id, peer_subnets, psk, ...)', 'Cria túnel IPSec via POST /v5/{pid}/vpn-connection. Suporta IKEv1/v2, AES-128/256, SHA2-256/512.'),
            ('delete_connection(ak, sk, region, pid, conn_id)', 'Exclui conexão VPN via DELETE /v5/{pid}/vpn-connection/{id}.'),
            ('list_classic_services(ak, sk, region, pid)', 'Lista serviços VPN Classic (v2.0 Neutron): router_id, subnet_id, status.'),
            ('create_classic_service(ak, sk, region, pid, name, subnet_id, router_id)', 'Cria serviço VPN Classic via POST /v2.0/vpn/vpnservices.'),
            ('delete_classic_service(ak, sk, region, pid, svc_id)', 'Exclui serviço VPN Classic via DELETE /v2.0/vpn/vpnservices/{id}.'),
            ('list_classic_connections(ak, sk, region, pid)', 'Lista conexões IPSec Classic: vpnservice_id, peer_address, status, IKE/IPSec policies.'),
            ('create_classic_connection(ak, sk, region, pid, ...)', 'Cria conexão IPSec Classic com endpoint groups. POST /v2.0/vpn/ipsec-site-connections.'),
            ('delete_classic_connection(ak, sk, region, pid, conn_id)', 'Exclui conexão IPSec Classic via DELETE /v2.0/vpn/ipsec-site-connections/{id}.'),
        ]),
    ]

    for mod_name, funcs in modulos:
        story += sub_title(f'8.x {mod_name}')
        story += make_table(
            ['Função', 'Descricao'],
            funcs,
            col_widths=[7*cm, 8.5*cm]
        )

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # 9. OPERAÇÕES DESTRUTIVAS
    # ══════════════════════════════════════════════════════════════════════════
    story += section_title('9. Operações Destrutivas e Auditoria')
    story += info_box(
        'Toda operação que modifica ou deleta recursos na Ananim Cloud é:<br/>'
        '1. <b>Autenticada</b> (sessão válida + role adequado)<br/>'
        '2. <b>Rate-limited</b> por role: admin=10, operator=5, analyst=3 ops/60s; viewer=bloqueado<br/>'
        '3. <b>Executada</b> via API Huawei com signing HMAC-SHA256<br/>'
        '4. <b>Logada</b> em action_logs com: usuário, recurso, conta, status, erro<br/>'
        '5. <b>Erro rastreável</b>: HTTP 500 retorna campo <b>ref</b> com ID único para correlação nos logs'
    )

    story += sub_title('9.1 Fluxo de Deleção de Backup com Imagem IMS')
    steps = [
        '1. Tentativa de DELETE /v3/{pid}/backups/{bid} → <b>BackupService.6204</b>',
        '2. Sistema detecta que backup está vinculado a imagem IMS',
        '3. Extrai image_id do nome do backup (padrão: backup_for_image_{uuid})',
        '4. DELETE /v2/images/{image_id} com X-Project-Id → <b>204 OK</b>',
        '5. Retry DELETE /v3/{pid}/backups/{bid} → <b>204 OK</b>',
        '6. Log registrado: action=delete, resource_type=cbr_backup, status=ok',
    ]
    for step in steps:
        story.append(P(f'• {step}', BODY))
        story.append(SP(2))

    story += sub_title('9.2 Fluxo de Remoção de Recurso de Vault com Backups Vinculados')
    steps2 = [
        '1. POST /v3/{pid}/vaults/{vid}/removeresources → <b>BackupService.6204</b>',
        '2. Lista backups do recurso: GET /v3/{pid}/backups?vault_id=&resource_id=',
        '3. Para cada backup: extrai image_id → DELETE imagem IMS → DELETE backup',
        '4. Retry POST removeresources → <b>200 OK</b>',
        '5. Log registrado: action=remove_resource, resource_type=cbr_vault, status=ok',
    ]
    for step in steps2:
        story.append(P(f'• {step}', BODY))
        story.append(SP(2))

    story += sub_title('9.3 Tabela de Ações Registradas')
    story += make_table(
        ['Acao', 'resource_type', 'API Huawei'],
        [
            ['delete', 'eip', 'DELETE /v1/{pid}/publicips/{id}'],
            ['delete', 'volume', 'DELETE /v2/{pid}/volumes/{id}'],
            ['delete', 'security_group', 'DELETE /v2.0/security-groups/{id}'],
            ['delete', 'cbr_backup', 'DELETE /v3/{pid}/backups/{id}'],
            ['delete', 'ims_image', 'DELETE /v2/images/{id}'],
            ['remove_resource', 'cbr_vault', 'POST /v3/{pid}/vaults/{vid}/removeresources'],
            ['update_policy', 'cbr_vault', 'POST /v3/{pid}/vaults/{vid}/addpolicy'],
            ['delete', 'obs_bucket', 'DELETE S3-API /{bucket}'],
            ['retype', 'evs_volume', 'POST /v2/{pid}/volumes/{id}/action (os-retype)'],
            ['resize', 'ecs_server', 'POST /v2/{pid}/servers/{id}/action (resize)'],
        ],
        col_widths=[3.5*cm, 3.5*cm, 9.5*cm]
    )
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # 10. CONFIGURAÇÃO
    # ══════════════════════════════════════════════════════════════════════════
    story += section_title('10. Configuração e Deployment')

    story += sub_title('10.1 Variáveis de Ambiente')
    story += make_table(
        ['Variável', 'Padrão', 'Descricao'],
        [
            ['FINOPS_PORT', '5050', 'Porta HTTP do servidor Flask'],
            ['FINOPS_SECRET', '(obrigatório)', 'Chave secreta para sessões. OBRIGATÓRIO em produção — servidor encerra (sys.exit) se ausente. Em dev gera valor aleatório.'],
            ['FINOPS_HTTPS', '0', 'Set 1 para ativar flag Secure no cookie de sessão e HSTS'],
            ['FINOPS_ORIGIN', '(obrigatório em prod)', 'Origin exato permitido pelo CORS (ex: https://finops.empresa.com). Em dev aceita localhost:5050. Servidor encerra se ausente em produção.'],
            ['FINOPS_ENC_KEY', '(opcional)', 'Chave AES-256 em base64 (32 bytes) para decriptar config.enc. Preferível a manter key.bin no filesystem.'],
            ['FINOPS_TAGS_DIR', r'c:\Projetos\tags', 'Diretório do projeto tags com credenciais .env'],
            ['FINOPS_WEBPANEL_DIR', r'c:\Projetos\huawei-cloud-panel\backend', 'Diretório do web panel com config.enc / key.bin'],
            ['FLASK_DEBUG', '0', 'Set 1 para modo debug (NUNCA em produção)'],
        ],
        col_widths=[4.5*cm, 3.5*cm, 8.5*cm]
    )

    story += sub_title('10.2 Inicialização')
    story.append(P('Executar sempre pelo <b>run.py</b> (não diretamente server.py):', BODY))
    story.append(SP(4))
    story.append(P('cd c:\\Projetos\\finops', CODE))
    story.append(P('python run.py', CODE))
    story.append(SP(4))
    story.append(P('O run.py executa na inicialização:', BODY))
    for item in [
        'auth.ensure_default_admin() — cria admin padrão se não existir usuário',
        'fdb.cleanup_sessions() — remove sessões expiradas',
        'fdb.cache_cleanup() — remove entradas de cache vencidas',
        'auth.cleanup_pending_mfa() — remove temp tokens de MFA expirados',
    ]:
        story.append(P(f'• {item}', BODY))
        story.append(SP(2))

    story += sub_title('10.3 Credenciais Padrão (Primeiro Acesso)')
    story += make_table(
        ['Campo', 'Valor'],
        [
            ['Usuário', 'admin'],
            ['Senha', 'Admin@2026!'],
            ['MFA', 'Desativado por padrão'],
            ['Role', 'admin'],
            ['Ação requerida', 'Trocar senha no primeiro login'],
        ],
        col_widths=[4*cm, 11*cm]
    )

    story += sub_title('10.4 Checklist de Segurança para Produção')
    checks = [
        'Definir FINOPS_SECRET com valor forte e único (mínimo 32 caracteres aleatórios)',
        'Definir FINOPS_HTTPS=1 e servir via HTTPS (nginx/caddy reverse proxy)',
        'Definir FINOPS_ORIGIN com o domínio exato da aplicação (sem wildcard *)',
        'Trocar senha do admin padrão imediatamente após primeiro acesso',
        'Ativar MFA para todos os usuários com acesso à plataforma',
        'Configurar FINOPS_ENC_KEY como variável de ambiente (evitar key.bin no filesystem)',
        'Verificar headers de segurança HTTP com ferramenta como securityheaders.com',
        'Configurar firewall para aceitar apenas porta 5050 de IPs autorizados',
        'Monitorar action_logs e read_logs periodicamente',
        'Configurar backup do arquivo finops.db regularmente',
        'Definir FINOPS_TAGS_DIR e FINOPS_WEBPANEL_DIR se paths padrão não se aplicarem',
        'Confirmar que FLASK_DEBUG=0 (nunca 1 em produção)',
    ]
    for c in checks:
        story.append(P(f'☐  {c}', BODY))
        story.append(SP(3))

    story += sub_title('10.5 Dependências (requirements.txt)')
    story += make_table(
        ['Pacote', 'Uso'],
        [
            ['flask', 'Framework web'],
            ['flask-cors', 'Controle de CORS'],
            ['bcrypt', 'Hash de senhas'],
            ['pyotp', 'TOTP (MFA)'],
            ['qrcode[pil]', 'Geração de QR Code para setup MFA'],
            ['requests', 'HTTP client para APIs Huawei (signing manual)'],
            ['cryptography', 'AES-256-GCM e Fernet para credenciais'],
            ['python-dotenv', 'Leitura de .env'],
            ['huaweicloudsdkcore', 'Core SDK Huawei Cloud'],
            ['huaweicloudsdkbss', 'SDK BSS (billing)'],
            ['huaweicloudsdkcbr', 'SDK CBR (backup)'],
            ['huaweicloudsdkces', 'SDK Cloud Eye (métricas)'],
            ['openpyxl / xlsxwriter', 'Export de tags para Excel'],
            ['reportlab', 'Geração de documentação PDF'],
        ],
        col_widths=[4*cm, 11*cm]
    )

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # 11. FERRAMENTAS — GUIA DE USO
    # ══════════════════════════════════════════════════════════════════════════
    story += section_title('11. Ferramentas — Guia de Uso')

    # 11.1 Projetos IAM
    story += sub_title('11.1 Projetos IAM')
    story += info_box(
        'Ferramenta acessível via menu lateral → <b>Ferramentas → 🗂️ Projetos IAM</b>. '
        'Lista todos os projetos IAM das contas cadastradas com contagem, quota e data de criação.'
    )
    story.append(P('<b>Funcionalidades:</b>', BODY))
    for item in [
        'KPIs: total de projetos, quota utilizada (barra de progresso), slots disponíveis, projetos habilitados',
        'Filtro por região (sa-brazil-1 / la-south-2) e busca por nome',
        'Coluna "Criado em": preenchida para projetos criados pela ferramenta; "—" para projetos externos',
        'Criar novo projeto: seleciona região, define sufixo (prefixado automaticamente), opção de descrição. Nome validado com regex /^[a-zA-Z0-9_\\-]{3,60}$/',
        'Remover projeto (exclusão completa): 3 etapas — escaneamento de recursos, confirmação digitando nome exato, execução em background',
    ]:
        story.append(P(f'• {item}', BODY))
        story.append(SP(2))

    story += sub_title('11.2 Fluxo de Exclusão de Projeto IAM')
    story += info_box('A exclusão roda em thread separada para não bloquear a interface. O progresso é visível em ⚙️ Operações.')
    steps_del = [
        ('1. Escaneamento', 'GET /api/tools/projetos/<id>/scan — lista ECS, EVS, EIPs, SGs, Vaults do projeto'),
        ('2. Confirmação', 'Usuário digita o nome exato do projeto para habilitar o botão de confirmação'),
        ('3. Disparo em background', 'POST /api/tools/projetos/<id>/delete → retorna {ok, task_id} imediatamente'),
        ('4. Execução (thread)', 'ECS batch delete (com delete_publicip=True, delete_volume=True) → EIPs → Volumes → SGs → Vaults → Projeto IAM'),
        ('5. Progresso', 'Polling em GET /api/tasks/<task_id> a cada 2,5s enquanto status=running'),
        ('6. Notificação', 'Toast aparece automaticamente no dashboard ao concluir (via postMessage iframe→pai)'),
        ('7. Auditoria', 'Cada etapa registrada em action_logs com status ok/partial/error'),
    ]
    story += make_table(
        ['Etapa', 'Detalhe'],
        steps_del,
        col_widths=[3.5*cm, 13*cm]
    )

    story += sub_title('11.3 Operações em Background (⚙️ Operações)')
    story.append(P(
        'A aba <b>⚙️ Operações</b> (menu lateral → Sistema) mostra todas as operações assíncronas da sessão atual. '
        'Auto-atualiza a cada 2,5 segundos enquanto houver tasks com status <b>running</b>.',
        BODY
    ))
    story.append(SP(4))
    story += make_table(
        ['Campo', 'Descricao'],
        [
            ['status', 'running (em andamento) | done (concluído) | error (falhou)'],
            ['steps', 'Lista de etapas executadas: {step, total, ok, errors}'],
            ['meta', 'Dados da operação: project_name, account_id, project_id'],
            ['user', 'Usuário que iniciou a operação'],
            ['started_at / finished_at', 'Timestamps Unix para cálculo de duração'],
            ['error', 'Mensagem de erro se status=error'],
        ],
        col_widths=[4*cm, 11.5*cm]
    )
    story.append(SP(4))
    story.append(P(
        '<b>Badge vermelho</b> aparece no item de menu "Operações" enquanto há tasks rodando, '
        'atualizado via <b>postMessage</b> enviado pelo iframe da página de operações ao frame pai (index.html). '
        '<b>Toast de conclusão</b> aparece automaticamente no canto inferior direito do dashboard ao '
        'detectar transição de status <b>running → done/error</b>.',
        BODY
    ))

    story += sub_title('11.4 Redimensionar Vault CBR')
    story += info_box(
        'Disponível em <b>Manutenção → Vault / CBR</b>. '
        'Botão <b>⇕ Redimensionar</b> no header de cada vault card, visível sem expandir o card.'
    )
    story.append(P('<b>Controles do modal:</b>', BODY))
    for item in [
        'Exibe capacidade atual e uso atual do vault',
        'Botões −− (−100 GB), − (−10 GB), + (+10 GB), ++ (+100 GB) para ajuste fino',
        'Presets rápidos: 256, 512, 1024, 2048, 5120, 10240 GB',
        'Preview em tempo real: ▲ +N GB (verde) ou ▼ −N GB (laranja), custo estimado (~$0,034/GB/mês)',
        'Botão desabilitado se novo valor = valor atual',
        'Validação: 10 GB mínimo, 10240 GB máximo (limites da API Huawei CBR)',
        'Após sucesso, recarrega automaticamente os dados do vault',
    ]:
        story.append(P(f'• {item}', BODY))
        story.append(SP(2))
    story.append(P('<b>API Huawei:</b> PUT /v3/{project_id}/vaults/{vault_id} com body {vault: {billing: {size: N}}}', CODE))

    story += sub_title('11.5 Editar Política de Vault')
    story.append(P(
        'Botão <b>📋 Política</b> no header de cada vault card (visível sempre, sem precisar expandir o card). '
        'Abre modal com duas opções:',
        BODY
    ))
    story.append(SP(3))
    story += make_table(
        ['Modo', 'Descricao'],
        [
            ['Política existente', 'Seleciona política CBR já criada no projeto. Lista carregada via GET /api/manutencao/vault/policies.'],
            ['Criar nova política', 'Define nome, dias de retenção OU número máximo de backups, dias da semana, horários de execução, timezone e status ativo/inativo.'],
        ],
        col_widths=[4*cm, 11.5*cm]
    )

    story += sub_title('11.6 VPN Manager')
    story += info_box(
        'Ferramenta acessível via menu lateral → <b>Manutenção → 🔒 VPN Manager</b>. '
        'Suporta dois modos de VPN Huawei Cloud: <b>Enterprise (API v5)</b> e <b>Classic (API v2.0 Neutron)</b>. '
        'A VPN Classic é a mais utilizada em ambientes legados — usa VPN Services + Endpoint Groups + IPSec Connections.'
    )
    story.append(P('<b>Abas da ferramenta:</b>', BODY))
    story += make_table(
        ['Aba', 'Tipo VPN', 'Recursos gerenciados'],
        [
            ['VPN Gateways', 'Enterprise (v5)', 'VPN Gateways: criação por VPC/subnet, flavor (Basic/Professional), subnets locais, AZs'],
            ['Customer Gateways', 'Enterprise (v5)', 'Customer Gateways: nome, IP público do cliente, BGP ASN opcional'],
            ['Conexões', 'Enterprise (v5)', 'Túneis IPSec: PSK, IKEv1/v2, AES/SHA configuráveis, peer subnets'],
            ['VPN Classic — Serviços', 'Classic (v2.0)', 'VPN Services: associados a router e subnet'],
            ['VPN Classic — Conexões', 'Classic (v2.0)', 'IPSec Site Connections: peer address, endpoint groups, PSK, políticas IKE/IPSec'],
        ],
        col_widths=[3.5*cm, 3.5*cm, 9.5*cm]
    )
    story.append(P('<b>Fluxo de criação de VPN Enterprise:</b>', BODY))
    story.append(SP(2))
    for item in [
        'Seleciona conta e projeto — região inferida automaticamente pelo prefixo do nome do projeto (ex: la-south-2_Cliente → region=la-south-2)',
        'Aba VPN Gateways → "+ Criar": seleciona VPC, subnet de conexão (carregadas da API), define subnets locais (CIDRs, uma por linha), escolhe flavor',
        'Aba Customer Gateways → "+ Criar": nome, IP público do cliente, BGP ASN opcional para roteamento dinâmico',
        'Aba Conexões → "+ Criar": seleciona VPN GW e Customer GW existentes, subnets do peer (CIDRs), PSK, parâmetros IKE/IPSec (avançado)',
        'Exclusão: botão 🗑 Excluir → modal de confirmação com nome e ID do recurso',
    ]:
        story.append(P(f'• {item}', BODY))
        story.append(SP(2))

    story.append(SP(4))
    story.append(P('<b>Fluxo de criação de VPN Classic:</b>', BODY))
    story.append(SP(2))
    for item in [
        'Aba "VPN Classic — Serviços" → "+ Criar": seleciona router (VPC) e subnet, define nome',
        'Aba "VPN Classic — Conexões" → "+ Criar": seleciona serviço VPN Classic, define peer address, PSK, subnets locais e remotas (endpoint groups criados automaticamente), políticas IKE/IPSec',
        'Listagem mostra: nome, status, peer address, rotas locais/remotas e data de criação',
        'Exclusão: botão 🗑 com confirmação — conexões devem ser excluídas antes do serviço',
    ]:
        story.append(P(f'• {item}', BODY))
        story.append(SP(2))

    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # 12. OPERAÇÕES DESTRUTIVAS — VAULT RESIZE E AÇÕES NOVAS
    # ══════════════════════════════════════════════════════════════════════════
    story += section_title('12. Ações Registradas em Auditoria (action_logs) — Atualizado')
    story += make_table(
        ['Acao', 'resource_type', 'API Huawei'],
        [
            ['delete', 'eip', 'DELETE /v1/{pid}/publicips/{id}'],
            ['delete', 'volume', 'DELETE /v2/{pid}/volumes/{id} (fallback v3)'],
            ['delete', 'security_group', 'DELETE /v2.0/security-groups/{id}'],
            ['delete', 'cbr_backup', 'DELETE /v3/{pid}/backups/{id}'],
            ['delete', 'ims_image', 'DELETE /v2/images/{id}'],
            ['remove_resource', 'cbr_vault', 'POST /v3/{pid}/vaults/{vid}/removeresources'],
            ['update_policy', 'cbr_vault', 'POST /v3/{pid}/vaults/{vid}/addpolicy'],
            ['delete', 'obs_bucket', 'DELETE S3-API /{bucket}'],
            ['retype', 'evs_volume', 'POST /v2/{pid}/volumes/{id}/action (os-retype)'],
            ['resize', 'ecs_server', 'POST /v2/{pid}/servers/{id}/action (resize)'],
            ['resize', 'vault', 'PUT /v3/{pid}/vaults/{id} — campo details: {new_size_gb}'],
            ['create', 'iam_project', 'POST /v3/projects — via huawei_iam.create_project()'],
            ['delete', 'iam_project', 'DELETE /v3/projects/{id} ou /v3-ext/projects/{id}'],
            ['delete', 'iam_project_resource', 'Múltiplas APIs — etapas de exclusão em batch registradas individualmente'],
            ['create', 'vpn_gateway', 'POST /v5/{pid}/vpn-gateways'],
            ['delete', 'vpn_gateway', 'DELETE /v5/{pid}/vpn-gateways/{id}'],
            ['create', 'vpn_customer_gw', 'POST /v5/{pid}/customer-gateways'],
            ['delete', 'vpn_customer_gw', 'DELETE /v5/{pid}/customer-gateways/{id}'],
            ['create', 'vpn_connection', 'POST /v5/{pid}/vpn-connection'],
            ['delete', 'vpn_connection', 'DELETE /v5/{pid}/vpn-connection/{id}'],
            ['create', 'vpn_classic_service', 'POST /v2.0/vpn/vpnservices'],
            ['delete', 'vpn_classic_service', 'DELETE /v2.0/vpn/vpnservices/{id}'],
            ['create', 'vpn_classic_connection', 'POST /v2.0/vpn/ipsec-site-connections'],
            ['delete', 'vpn_classic_connection', 'DELETE /v2.0/vpn/ipsec-site-connections/{id}'],
        ],
        col_widths=[3.5*cm, 3.5*cm, 9.5*cm]
    )

    doc.build(story)
    print(f'PDF gerado: {path}')

# Imports adicionais necessários
from reportlab.platypus import NextPageTemplate, FrameBreak

if __name__ == '__main__':
    build()
