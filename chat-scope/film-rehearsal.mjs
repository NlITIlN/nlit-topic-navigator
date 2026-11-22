import assert from "node:assert/strict";

// Reference tool arguments an assistant can produce from film-dialogue.md.
// This fixture exercises the real server and UI. It does not simulate model scheduling.
export async function rehearseFilmConversation({call, register, mount, snapshot}) {
  const a={owner:"fixture-film",session:"film-A"}, b={...a,session:"film-B"};
  const card=(path,done,decisions,nextStep,expectedRevision=0)=>({path,done,decisions,nextStep,expectedRevision});
  const sync=(cards,who=a)=>call(who,"topics_sync_conversation",{cards});
  const cast=card(["Персонажи"],"Список героев готов.","Оставить смотрительницу Миру и радиста Льва.","Нарисовать силуэты.");
  const plot=card(["Сюжет"],"Записан черновой синопсис.","90 секунд, ложный сигнал, открытый финал.","Разложить поворот на три кадра.");
  await assert.rejects(sync([plot]),/не подтверждён/);
  await register(a);await register(b);
  assert.equal((await call(a,"topics_panel")).total,0);
  assert.deepEqual((await sync([cast,plot])).cards.map(c=>c.status),["saved","saved"]);
  const initial=await call(a,"topics_panel");
  assert.deepEqual(initial.topics.map(t=>t.title).sort(),["Персонажи","Сюжет"]);
  const beforeReplay=snapshot();
  assert.ok((await sync([cast,plot])).cards.every(c=>c.status==="unchanged"));
  assert.deepEqual(snapshot(),beforeReplay);

  const ui=await mount(a,{updateModelContext:{structuredContent:{}}});
  assert.match(await ui.tree(),/Персонажи/);
  assert.match(await ui.select("Сюжет"),/открытый финал/);
  assert.equal(ui.contextUpdates.length,1);
  assert.equal(ui.contextUpdates[0].structuredContent.nextStep,"Разложить поворот на три кадра.");
  const chosen=ui.contextUpdates[0].structuredContent.topicId;
  assert.equal((await call(a,"topics_selected")).topic.id,chosen);
  const background=card(["Генерация окружения"],"Готов пробный фон бухты.","Холодный туман и один янтарный источник.","Получить ночной вариант с тем же ракурсом.");
  // A visible panel can poll its catalog. A chat message on its own delivers no cards.
  assert.doesNotMatch(await ui.poll(),/Генерация окружения/);
  await sync([background]); // assistant tool call on the substantive turn, no second panel open
  assert.match(await ui.poll(),/Генерация окружения/);
  assert.equal((await call(a,"topics_list",{parentId:null})).total,3);
  const mira=card(["Персонажи","Мира"],"Набросок силуэта готов.","Оставить широкий плащ.","Нарисовать профиль у линзы.");
  const lev=card(["Персонажи","Лев"],"Собраны референсы рук.","Показать Льва через сломанный наушник.","Нарисовать крупный план.");
  const updatedPlot={...plot,done:"Синопсис записан. Собраны три кадра поворота.",nextStep:"Проверить паузу перед последним кадром.",expectedRevision:1};
  await sync([mira,lev,updatedPlot]);
  const reopened=await mount(a);
  assert.match(await reopened.tree(),/Генерация окружения/);
  const children=await reopened.expand("Персонажи");
  assert.match(children,/Мира ·/);assert.match(children,/Лев ·/);
  const current=(await call(a,"topics_selected")).topic;
  assert.equal(current.id,chosen);assert.equal(current.revision,2);
  assert.equal(current.nextStep,updatedPlot.nextStep);
  assert.match(reopened.selected,/Проверить паузу/);
  const before=snapshot();
  await sync([mira,lev,updatedPlot]);await sync([]);
  assert.deepEqual(snapshot(),before);
  assert.equal((await call(a,"topics_list")).total,5);
  assert.equal((await call(b,"topics_panel")).total,0);
  await assert.rejects(call(b,"topics_get",{id:chosen}),/не найдена/);
  assert.equal((await sync([plot])).cards[0].status,"conflict");
  assert.equal((await call(a,"topics_selected")).topic.nextStep,updatedPlot.nextStep);
  // An explicit owner edit protects the revised card from subsequent automatic overwrites.
  await call(a,"topics_update",{id:chosen,expectedRevision:2,nextStep:"Проверить длительность по таймеру."});
  assert.equal((await sync([{...updatedPlot,expectedRevision:3}])).cards[0].status,"conflict");
  assert.equal((await call(a,"topics_selected")).topic.nextStep,"Проверить длительность по таймеру.");
  const fallback=await mount(a);
  await fallback.select("Персонажи");assert.equal(fallback.contextUpdates.length,0);
  assert.equal((await call(a,"topics_selected")).topic.nextStep,cast.nextStep);
  for(const mode of ["text","structuredContent"]){
    const client=await mount(a,{updateModelContext:{[mode]:{}}});
    await client.select("Сюжет");
    await client.select("Персонажи");
    assert.equal(client.contextUpdates.length,2);
    if(mode==="text"){
      assert.match(client.contextUpdates[0].content[0].text,/Проверить длительность/);
      assert.match(client.contextUpdates[1].content[0].text,/\nСледующий шаг: Нарисовать силуэты/);
      assert.doesNotMatch(client.contextUpdates[1].content[0].text,/Сюжет/);
      assert.equal(client.contextUpdates[1].structuredContent,undefined);
    }else{
      assert.equal(client.contextUpdates[0].structuredContent.title,"Сюжет");
      assert.equal(client.contextUpdates[1].structuredContent.title,"Персонажи");
    }
    await client.clearSelection();
    assert.deepEqual(client.contextUpdates.at(-1),mode==="text"?{content:[]}:{structuredContent:{}});
    assert.equal((await call(a,"topics_selected")).selected,null);
  }
  await assert.rejects(sync([{...cast,transcript:"лишнее поле"}]),/краткие поля/);
  await assert.rejects(sync([{...cast,done:"x".repeat(301)}]),/однострочную/);
  console.log("PASS film dialogue fixture: two topics, third root, two children, select/context, return/replay, owner edit and adjacent chat.");
}
