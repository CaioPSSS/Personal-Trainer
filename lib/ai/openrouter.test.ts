import test from 'node:test';
import assert from 'node:assert/strict';
import { fixMojibake, parseJsonFromMarkdown } from './openrouter';

test('OpenRouter helpers: fixMojibake decodes UTF-8 Portuguese artifacts without breaking valid A-tilde', () => {
  assert.equal(
    fixMojibake('SÃ£o Paulo, sessÃ£o de hipertrofia e aÃ§Ã£o Ã\u00a0 tarde'),
    'São Paulo, sessão de hipertrofia e ação à tarde'
  );
  assert.equal(fixMojibake('SÃ³ Ã© possÃ­vel com paciÃªncia e esforÃ§o'), 'Só é possível com paciência e esforço');
  // Preserve real 'Ã ' (capital A with tilde followed by space) rather than mangling into 'à '
  assert.equal(fixMojibake('Treino Ã  noite'), 'Treino Ã  noite');
});

test('OpenRouter helpers: parseJsonFromMarkdown extracts JSON from fenced blocks and raw prose', () => {
  const fenced = 'Aqui está sua prescrição:\n```json\n{ "title": "Bloco A", "durationWeeks": 4 }\n```\nBons treinos!';
  assert.deepEqual(parseJsonFromMarkdown(fenced), {
    title: 'Bloco A',
    durationWeeks: 4,
  });

  const proseWrapped = 'Resultado:\n{"status": "ok", "items": ["SÃ©rie 1", "AÃ§Ã£o"]}\nFim.';
  assert.deepEqual(parseJsonFromMarkdown(proseWrapped), {
    status: 'ok',
    items: ['Série 1', 'Ação'],
  });

  const arrayWrapped = 'Lista: [{"id": 1}, {"id": 2}]';
  assert.deepEqual(parseJsonFromMarkdown(arrayWrapped), [{ id: 1 }, { id: 2 }]);

  assert.throws(() => parseJsonFromMarkdown('sem json valido aqui'));
});
