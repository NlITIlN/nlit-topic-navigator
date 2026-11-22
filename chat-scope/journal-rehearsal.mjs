import assert from "node:assert/strict";

export async function checkMergeJournal({call,register,snapshot,mountWith,widgetCall}) {
  const chat = {owner:"fixture-journal-owner",session:"fixture-journal-A"};
  const adjacent = {...chat,session:"fixture-journal-B"};
  const fresh = {...chat,session:"fixture-journal-new"};
  const missing = {owner:chat.owner};
  const id = "fixture-same-operation-id";
  async function merge(who,label) {
    const make = async title => (await call(who,"topics_create",{title})).topic.id;
    const pair = {primaryId:await make(label+" основа"),secondaryId:await make(label+" детали")};
    const plan = await call(who,"topics_merge_preview",pair);
    await call(who,"topics_merge",{...pair,operationId:id,previewDigest:plan.digest,confirm:true});
  }
  await register(chat);await register(adjacent);
  await merge(chat,"Маяк");await merge(adjacent,"Остров");

  // The chat's launch succeeded in A, but this host routes all subsequent widget calls to B.
  const launch=await widgetCall(chat,{name:"topics_panel"});
  const mismatched=await mountWith(params=>widgetCall(adjacent,params),launch);
  assert.match(mismatched.status,/отличается от запроса открытия/);
  assert.doesNotMatch(mismatched.list,/Остров|Маяк/);
  mismatched.node("treerefresh").onclick();
  assert.doesNotMatch(await mismatched.tree(),/Остров|Маяк/);
  await mismatched.node("mergelog").onclick();
  assert.match(mismatched.node("mergeundostatus").textContent,/Контекст панели изменился/);
  assert.equal(mismatched.node("mergeoperation").children.length,0);
  await mismatched.node("checkpanelscope").onclick();
  assert.match(mismatched.node("panelscope").textContent,/Отличается от запроса открытия/);

  let route = fresh, gate;
  const calls = [];
  const panel = await mountWith(async params=>{
    calls.push(params.name);
    if(gate && params.name==="topics_merges_list")await gate;
    return widgetCall(route,params);
  });
  const node = panel.node;
  const click = button => node(button).onclick();
  const idle = () => {
    assert.equal(node("mergeoperation").children.length,0);
    for(const name of ["mergeundopreview","mergeundoconfirm","mergelogmore"])
      assert.ok(node(name).hidden && node(name).disabled,name+" must be unavailable");
    assert.equal(node("mergeundoplan").textContent,"");
  };
  const diagnose = async () => {
    await click("checkpanelscope");
    const text=node("panelscope").textContent;
    assert.ok(![chat,adjacent,fresh].some(who=>text.includes(who.session)||text.includes(who.owner)));
    return text;
  };
  const baseline=snapshot();
  await click("mergelog");
  assert.match(node("mergeundostatus").textContent,/ждёт привязки/i);idle();
  const waitingCalls=calls.length;
  await click("mergeundopreview");await click("mergeundoconfirm");
  assert.equal(calls.length,waitingCalls);
  assert.deepEqual(snapshot(),baseline);
  await click("mergelogclose");

  route=chat;
  const {fingerprint} = await call(chat,"topics_scope_diagnostics");
  assert.ok((await diagnose()).includes(fingerprint));
  await panel.poll();
  let release;
  gate=new Promise(resolve=>{release=resolve});
  const opening=click("mergelog");
  assert.match(node("mergeundostatus").textContent,/Загружаю/);idle();
  release();await opening;gate=null;
  const rows = node("mergeoperation").children;
  assert.equal(rows.length,1);assert.match(rows[0].textContent,/Маяк/);
  assert.doesNotMatch(rows[0].textContent,/Остров/);
  assert.equal(node("mergeundopreview").disabled,false);assert.ok(node("mergeundoconfirm").hidden);
  await click("mergeundopreview");assert.equal(node("mergeundoconfirm").disabled,false);
  assert.match(node("mergeundoplan").textContent,/Маяк/);
  assert.deepEqual(snapshot(),baseline);

  // Host supplies a different confirmed scope between preview and commit.
  route=adjacent;
  const otherFingerprint = (await call(adjacent,"topics_scope_diagnostics")).fingerprint;
  assert.notEqual(otherFingerprint,fingerprint);assert.ok((await diagnose()).includes(otherFingerprint));
  await click("mergeundoconfirm");
  assert.match(node("mergeundostatus").textContent,/Контекст панели изменился/);idle();
  await click("mergelogclose");
  await click("mergelog");
  assert.match(node("mergeundostatus").textContent,/исходном чате/);idle();
  await click("mergelogclose");
  route=missing;
  assert.match(await diagnose(),/не получила контекст/);
  await click("mergelog");assert.match(node("mergeundostatus").textContent,/не получила контекст/);idle();
  assert.deepEqual(snapshot(),baseline);

  await click("mergelogclose");route=fresh;
  await register(fresh);await panel.poll();
  await click("mergelog");assert.match(node("mergeundostatus").textContent,/пока нет объединений/);idle();
  console.log("PASS merge journal: verified scope, unbound and empty states, panel diagnostics, lost and switched metadata; stale undo blocked.");
}
