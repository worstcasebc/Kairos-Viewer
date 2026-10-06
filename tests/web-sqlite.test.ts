// @vitest-environment node
import { expect, test } from 'vitest';
import { dataUrlToBytes } from '../src/web/sqlite';
import { fixtureBytes, testSqlJs } from './helpers/sqljs';

test('dataUrlToBytes dekodiert Base64-Data-URLs', () => {
  expect([...dataUrlToBytes('data:application/wasm;base64,AGFzbQ==')]).toEqual([0, 97, 115, 109]);
});

test('createSqlJs öffnet eine Kairos-Datei aus Bytes', async () => {
  const sql = await testSqlJs();
  const db = new sql.Database(fixtureBytes('demo-v2.kairos'));
  try {
    expect(db.exec('SELECT count(*) FROM task')[0].values[0][0]).toBe(9);
  } finally {
    db.close();
  }
});
