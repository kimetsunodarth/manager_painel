import { Router } from 'express';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import { listDocuments, addDocument, getDocumentById, updateDocument, deleteDocument, clearAllDocuments, DOCUMENTS_FILES_DIR } from '../data/documents.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', (_, res) => {
  res.json(listDocuments());
});

/** Importar documento (apenas admin). Body: { fileName, contentBase64 }. */
router.post('/', requireAdmin, (req, res) => {
  const fileName = req.body?.fileName && String(req.body.fileName).trim();
  const contentBase64 = req.body?.contentBase64;
  if (!fileName) {
    return res.status(400).json({ error: 'fileName é obrigatório' });
  }
  if (!contentBase64 || typeof contentBase64 !== 'string') {
    return res.status(400).json({ error: 'contentBase64 é obrigatório' });
  }
  let buffer;
  try {
    buffer = Buffer.from(contentBase64, 'base64');
  } catch (e) {
    return res.status(400).json({ error: 'contentBase64 inválido' });
  }
  const item = addDocument(fileName, new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }));
  const filePath = path.join(DOCUMENTS_FILES_DIR, item.id);
  try {
    if (!existsSync(DOCUMENTS_FILES_DIR)) mkdirSync(DOCUMENTS_FILES_DIR, { recursive: true });
    writeFileSync(filePath, buffer);
  } catch (e) {
    return res.status(500).json({ error: 'Falha ao salvar arquivo: ' + e.message });
  }
  return res.status(201).json(item);
});

/** Limpar todos os documentos (apenas admin). */
router.post('/clear', requireAdmin, (_, res) => {
  clearAllDocuments();
  return res.json({ ok: true, message: 'Todos os documentos foram removidos.' });
});

/** Editar nome do documento (apenas admin). Body: { arquivo }. */
router.patch('/:id', requireAdmin, (req, res) => {
  const doc = updateDocument(req.params.id, { arquivo: req.body?.arquivo });
  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });
  return res.json(doc);
});

/** Excluir documento (apenas admin). */
router.delete('/:id', requireAdmin, (req, res) => {
  const doc = getDocumentById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });
  const filePath = path.join(DOCUMENTS_FILES_DIR, doc.id);
  if (existsSync(filePath)) {
    try { unlinkSync(filePath); } catch (_) {}
  }
  deleteDocument(req.params.id);
  return res.json({ ok: true });
});

// Download: envia o arquivo se existir; senão 404
router.get('/:id/download', (req, res) => {
  const doc = getDocumentById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });
  const filePath = path.join(DOCUMENTS_FILES_DIR, doc.id);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'Arquivo não encontrado no servidor' });
  }
  res.download(filePath, doc.arquivo || doc.id);
});

export default router;
