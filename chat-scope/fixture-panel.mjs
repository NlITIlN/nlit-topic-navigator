import vm from "node:vm";

// Run the served widget script against a fixture host. Each call starts a new panel.
export async function mountFixturePanel(html, callTool, capabilities = {}, openingResult) {
  const nodes = new Map();
  const contextUpdates = [];
  const element = () => ({
    children: [], value: "", style: {setProperty() {}}, addEventListener() {},
    showModal() { this.open = true; }, close() { this.open = false; },
    append(...children) { for(const child of children)child.parent=this; this.children.push(...children); },
    prepend(...children) { for(const child of children)child.parent=this; this.children.unshift(...children); },
    remove() { if(this.parent)this.parent.children=this.parent.children.filter(child => child!==this); },
    replaceChildren(...children) { this.children = children; }
  });
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, element());
    return nodes.get(id);
  };
  node("tree").open = html.includes('id="tree" open');
  node("sort").value = "updated";
  const doc = {visibilityState:"visible", getElementById:node, createElement:element, addEventListener() {}, querySelector() { return null; }};
  let receive;
  const parent = {
    async postMessage(msg) {
      if(msg.method==="ui/notifications/initialized" && openingResult)
        receive({source:parent,origin:"https://fixture.invalid",data:{jsonrpc:"2.0",method:"ui/notifications/tool-result",params:openingResult}});
      if (msg.id === undefined) return;
      let result;
      if(msg.method === "ui/initialize") result = {hostCapabilities:capabilities, hostInfo:{name:"Fixture host"}};
      else if(msg.method === "ui/update-model-context"){contextUpdates.push(JSON.parse(JSON.stringify(msg.params)));result={};}
      else if(msg.method === "tools/call")result=await callTool(msg.params);
      else throw Error("Unexpected fixture RPC: "+msg.method);
      receive({source:parent, origin:"https://fixture.invalid", data:{jsonrpc:"2.0", id:msg.id, result}});
    }
  };
  let tick;
  const window = {setInterval(fn) {tick=fn;}, addEventListener(type, fn) { if (type === "message") receive = fn; }};
  const context = vm.createContext({document:doc, window, parent, setTimeout, clearTimeout, URL});
  let timer;
  const rendered = new Promise((resolve,reject) => {
    timer = setTimeout(() => reject(Error("Fixture panel did not finish loading")), 4000);
    Object.defineProperty(node("status"), "textContent", {set(text) {
      if (text !== "Загружаю темы…") resolve(text);
    }});
  });
  try {
    vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
    const status = await rendered;
    const text = el => [el.textContent || "", ...el.children.map(text)].join(" ");
    const walk = el => [el, ...el.children.flatMap(walk)];
    const tree = node("treeitems");
    async function settleTree() {
      const deadline=Date.now()+4000;
      while(text(tree).includes("Загружаю ветвь…")) {
        if(Date.now()>deadline)throw Error("Tree did not finish loading");
        await new Promise(resolve=>setTimeout(resolve,5));
      }
      return text(tree);
    }
    await settleTree();
    return {status, list:text(node("list")), selected:text(node("selected")), contextUpdates, tree:settleTree, node,
      async poll() {await tick();return await settleTree();},
      async clearSelection() {
        const btn=walk(node("selected")).find(el=>el.textContent==="Снять выбор");
        if(!btn)throw Error("Clear button missing");
        await btn.onclick();await settleTree();
      },
      async expand(title) {
        const branch=tree.children.find(el=>el.children[0]?.textContent?.startsWith(title+" ·"));
        if(!branch)throw Error("Tree branch missing for "+title);
        branch.open=true;branch.ontoggle();return await settleTree();
      },
      async select(title) {
        const article=tree.children.find(el=>el.children[0]?.textContent?.startsWith(title+" ·"));
        const button=article&&walk(article).find(el=>el.textContent==="Выбрать для чата");
        if(!button) throw Error("Selection button missing for "+title);
        await button.onclick();await settleTree();
        return text(node("selected"));
      }
    };
  } finally { clearTimeout(timer); }
}
