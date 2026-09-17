/**
 * Proves the concurrency rule holds against a running API.
 *
 *   node scripts/race-test.mjs [apiUrl]
 *
 * Fires N simultaneous "pending -> running" requests at the same job and checks
 * that exactly one wins, the job ends on version 2, and the audit log has
 * exactly one entry. See README, "Concurrency".
 */
const B = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');

async function newJob(title) {
  const r = await fetch(`${B}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, type: 'race-test' }),
  });
  return (await r.json()).id;
}

async function race(n, label) {
  const id = await newJob(label);
  const attempts = Array.from({ length: n }, () =>
    fetch(`${B}/jobs/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'running' }),
    }).then(async (r) => ({ status: r.status, body: await r.json() })),
  );
  const results = await Promise.all(attempts);
  const ok = results.filter((r) => r.status === 200);
  const conflict = results.filter((r) => r.status === 409);
  const other = results.filter((r) => ![200, 409].includes(r.status));

  const final = await (await fetch(`${B}/jobs/${id}`)).json();
  const history = await (await fetch(`${B}/jobs/${id}/history`)).json();

  console.log(`${label}: ${n} simultaneous PATCH -> running`);
  console.log(`  200 OK        : ${ok.length}`);
  console.log(`  409 Conflict  : ${conflict.length}`);
  console.log(`  unexpected    : ${other.length} ${other.map(o=>o.status).join(',')}`);
  console.log(`  final status  : ${final.status}  version: ${final.version}`);
  console.log(`  audit entries : ${history.length}`);
  if (conflict[0]) console.log(`  loser sees    : "${conflict[0].body.message}"`);
  console.log(`  VERDICT       : ${ok.length === 1 && final.version === 2 && history.length === 1 ? 'PASS' : 'FAIL'}`);
  console.log();
}

await race(2, 'Two tabs');
await race(10, 'Ten clients');

// full lifecycle + terminal lock
const id = await newJob('Lifecycle');
const patch = (status) =>
  fetch(`${B}/jobs/${id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }).then(async (r) => `${status}: ${r.status} ${r.status !== 200 ? (await r.json()).message : 'ok'}`);
console.log('Lifecycle:');
for (const s of ['running', 'completed', 'running', 'failed', 'pending']) console.log('  ' + await patch(s));

// optimistic version check
const id2 = await newJob('Stale tab');
console.log('\nStale expectedVersion (tab thinks v1, job is v1 -> should pass, then reuse v1 -> should fail):');
for (const v of [1, 1]) {
  const r = await fetch(`${B}/jobs/${id2}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'running', expectedVersion: v }),
  });
  console.log(`  expectedVersion=${v} -> ${r.status} ${r.status !== 200 ? (await r.json()).message : 'ok'}`);
}

console.log('\nStats:', JSON.stringify(await (await fetch(`${B}/jobs/stats`)).json()));
