import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeVisibleProjects, projectDisplayName } from '../src/utils/scopedProject.js';

const ecoa = { id: 'd534', name: 'sa-brazil-1_Ecoa', perfil: 'ANANIMCLOUD_ECOA' };
const prevendas = { id: '19f9', name: 'sa-brazil-1_PreVendas', perfil: 'ANANIMCLOUD_PREVENDAS' };

test('sem projeto escolhido, vale a lista visível do usuário', () => {
  assert.deepEqual(scopeVisibleProjects({ role: 'client' }, [ecoa, prevendas], null), [ecoa, prevendas]);
});

test('cliente: projeto escolhido só vale se estiver na visão dele', () => {
  assert.deepEqual(scopeVisibleProjects({ role: 'client' }, [ecoa, prevendas], { id: 'd534', perfil: 'ANANIMCLOUD_ECOA' }), [ecoa]);
  assert.deepEqual(scopeVisibleProjects({ role: 'client' }, [ecoa], { id: 'outro', perfil: 'ANANIMCLOUD_OUTRO' }), []);
  assert.deepEqual(scopeVisibleProjects({ role: 'client' }, [ecoa], { id: 'd534', perfil: 'ANANIMCLOUD_OUTRO' }), []);
});

test('admin pode escolher qualquer projeto', () => {
  const x = { id: 'x', perfil: 'P' };
  assert.deepEqual(scopeVisibleProjects({ role: 'admin' }, [], x), [x]);
});

test('nome do cliente sem o prefixo da região', () => {
  assert.equal(projectDisplayName({ name: 'sa-brazil-1_Ecoa' }), 'Ecoa');
  assert.equal(projectDisplayName({ name: 'Cliente On-Premise' }), 'Cliente On-Premise');
  assert.equal(projectDisplayName({ displayPerfil: 'ANANIM_ECOA', name: 'sa-brazil-1_Ecoa' }), 'Ecoa');
});
