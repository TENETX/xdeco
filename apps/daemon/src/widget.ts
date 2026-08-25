import {
  Check,
  ChevronRight,
  ExternalLink,
  FileText,
  Folder,
  Inbox,
  Link,
  ListTodo,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  X,
  type IconNode,
} from "lucide";
import { WIDGET_STYLES } from "./widget-styles.js";

function lucideIcon(nodes: IconNode): string {
  const children = nodes.map(([tag, attributes]) => {
    const serialized = Object.entries(attributes)
      .map(([key, value]) => `${key}="${String(value)}"`)
      .join(" ");
    return `<${tag} ${serialized}></${tag}>`;
  }).join("");
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`;
}

const LUCIDE_ICONS = {
  thread: lucideIcon(MessageSquare),
  folder: lucideIcon(Folder),
  chevron: lucideIcon(ChevronRight).replace("<svg ", '<svg class="chevron" '),
  plus: lucideIcon(Plus),
  search: lucideIcon(Search),
  close: lucideIcon(X),
  check: lucideIcon(Check),
  result: lucideIcon(ExternalLink),
  retry: lucideIcon(RotateCcw),
  file: lucideIcon(FileText),
  link: lucideIcon(Link),
  todo: lucideIcon(ListTodo),
  empty: lucideIcon(Inbox),
};

export const XDECO_URI = "ui://xdeco/dashboard-v7.html";

export const XDECO_HTML = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>xdeco</title>
  <style>${WIDGET_STYLES}</style>
</head>
<body>
  <section class="shell">
    <header class="topbar"><div class="brandMark">${LUCIDE_ICONS.todo}</div><div class="brandCopy"><strong>xdeco</strong><span>Codex Todo</span></div><div class="connection" id="connection"><i></i><span>连接中</span></div></header>
    <div class="layout"><aside class="sidebar"><header class="sidebarHeader"><h2>项目</h2><button class="newButton" data-slot="button" id="newBinding" type="button">${LUCIDE_ICONS.plus}新增</button></header><div class="tree" id="tree"><div class="sideEmpty">正在读取关联…</div></div></aside><main class="workspace" id="workspace"><div class="empty"><div class="spinner"></div><span>正在读取 Todo…</span></div></main></div>
  </section>
  <div id="modalLayer"></div><div class="toast" id="toast" role="status" aria-live="polite"></div>
  <script>
  (function(){
    "use strict";
    var labels={draft:"草稿",ready:"队列中",sending:"发送中",running:"运行中",completed:"已完成",failed:"失败",archived:"已结束"};
    var state={overview:null,selectedThreadId:"",expandedGroups:{},pickerCollapsedGroups:{},modal:"",pickerQuery:"",receiptTodoId:"",receiptResult:null,receiptLoading:false,receiptError:"",busy:false};
    var pending=new Map(),nextId=1,toastTimer,pollTimer=null,refreshPromise=null,modalReturnFocus=null;
    var icons=${JSON.stringify(LUCIDE_ICONS)};function icon(name){return icons[name]||""}
    function esc(value){return String(value==null?"":value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}
    function request(method,params){var id=nextId++;window.parent.postMessage({jsonrpc:"2.0",id:id,method:method,params:params},"*");return new Promise(function(resolve,reject){pending.set(id,{resolve:resolve,reject:reject});setTimeout(function(){if(pending.has(id)){pending.delete(id);reject(new Error("Codex UI bridge 请求超时"))}},180000)})}
    function callTool(name,args){if(window.openai&&typeof window.openai.callTool==="function")return window.openai.callTool(name,args||{});return request("tools/call",{name:name,arguments:args||{}})}
    function value(payload){if(!payload)return null;if(payload.structuredContent&&Object.prototype.hasOwnProperty.call(payload.structuredContent,"result"))return payload.structuredContent.result;if(Object.prototype.hasOwnProperty.call(payload,"result"))return payload.result;if(payload.call_tool_result)return value(payload.call_tool_result);if(payload.mcp_tool_result)return value(payload.mcp_tool_result);return null}
    function overview(payload){var data=value(payload)||payload;return data&&Array.isArray(data.projects)&&Array.isArray(data.codexProjects)&&Array.isArray(data.codexThreads)&&Array.isArray(data.todos)?data:null}
    function friendly(error){var message=error&&error.message?error.message:String(error||"操作失败");if(/Project not found/i.test(message))return"关联已不存在，请重新关联";if(/Todo does not have a completion result/i.test(message))return"这个 Todo 还没有结果";if(/thread.*not found|rollout.*not found/i.test(message))return"找不到这个 Codex task";return message}
    function toast(message,error){var element=document.getElementById("toast");element.textContent=message;element.className=error?"toast show error":"toast show";clearTimeout(toastTimer);toastTimer=setTimeout(function(){element.className="toast"},2400)}
    function normalizePath(path){return String(path||"").replace(/\\/g,"/").replace(/\/+$/g,"").toLowerCase()}
    function bindingFor(thread){return thread&&state.overview?state.overview.projects.find(function(project){return project.targetThreadId===thread.id})||null:null}
    function selectedThread(){return state.overview?state.overview.codexThreads.find(function(thread){return thread.id===state.selectedThreadId})||null:null}
    function codexProjectFor(thread){if(!thread||!state.overview)return null;var cwd=normalizePath(thread.cwd),matches=state.overview.codexProjects.filter(function(project){var root=normalizePath(project.rootPath);return root&&(cwd===root||cwd.indexOf(root+"/")===0)}).sort(function(a,b){return normalizePath(b.rootPath).length-normalizePath(a.rootPath).length});return matches[0]||null}
    function groupFor(thread){var project=codexProjectFor(thread);return{key:project?project.id:"__none",name:project?project.name:"无项目"}}
    function todosFor(binding){return binding&&state.overview?state.overview.todos.filter(function(todo){return todo.projectId===binding.id&&todo.status!=="archived"}):[]}
    function associatedEntries(){if(!state.overview)return[];return state.overview.projects.filter(function(binding){return Boolean(binding.targetThreadId)}).map(function(binding){var thread=state.overview.codexThreads.find(function(candidate){return candidate.id===binding.targetThreadId});return thread?{binding:binding,thread:thread}:null}).filter(Boolean)}
    function groupEntries(entries){var groups=[];entries.forEach(function(entry){var meta=groupFor(entry.thread),group=groups.find(function(candidate){return candidate.key===meta.key});if(!group){group={key:meta.key,name:meta.name,entries:[]};groups.push(group)}group.entries.push(entry)});return groups.sort(function(a,b){if(a.key==="__none")return 1;if(b.key==="__none")return-1;return a.name.localeCompare(b.name)})}
    function activeCount(todos){return todos.filter(function(todo){return todo.status==="sending"||todo.status==="running"}).length}
    function hasActiveTodo(){return Boolean(state.overview&&state.overview.todos.some(function(todo){return todo.status==="sending"||todo.status==="running"}))}
    function persist(){if(window.openai&&typeof window.openai.setWidgetState==="function")window.openai.setWidgetState({selectedThreadId:state.selectedThreadId})}
    function restore(){var saved=window.openai&&window.openai.widgetState;if(saved&&typeof saved.selectedThreadId==="string")state.selectedThreadId=saved.selectedThreadId}
    function ensureSelection(){var entries=associatedEntries(),exists=entries.some(function(entry){return entry.thread.id===state.selectedThreadId});if(!exists)state.selectedThreadId=(entries[0]&&entries[0].thread.id)||"";var thread=selectedThread();if(thread)state.expandedGroups[groupFor(thread).key]=true}
    function renderConnection(){var connected=Boolean(state.overview&&state.overview.controller&&state.overview.controller.codexAvailable),element=document.getElementById("connection");element.className=connected?"connection connected":"connection";element.querySelector("span").textContent=connected?"Codex 已连接":"Codex 离线"}
    function renderTree(){var tree=document.getElementById("tree"),groups=groupEntries(associatedEntries());if(!groups.length){tree.innerHTML='<div class="sideEmpty">暂无关联<br><button class="button" id="emptyAdd" type="button">'+icon("plus")+'新增关联</button></div>';document.getElementById("emptyAdd").onclick=openPicker;return}tree.innerHTML=groups.map(function(group){var expanded=state.expandedGroups[group.key]!==false;return'<section class="projectGroup" data-slot="accordion-item"><button data-slot="accordion-trigger" class="projectToggle '+(expanded?'expanded':'')+'" type="button" data-group="'+esc(group.key)+'" aria-expanded="'+expanded+'">'+icon("chevron")+icon("folder")+'<span>'+esc(group.name)+'</span><em>'+group.entries.length+'</em></button><div data-slot="accordion-content" class="threadList '+(expanded?'expanded':'')+'" aria-hidden="'+(!expanded)+'" '+(expanded?'':'inert')+'>'+group.entries.map(function(entry){var active=entry.thread.id===state.selectedThreadId,todos=todosFor(entry.binding);return'<button data-slot="item" class="threadButton '+(active?'active':'')+'" type="button" data-thread="'+esc(entry.thread.id)+'">'+icon("thread")+'<span>'+esc(entry.thread.name)+'</span><em>'+todos.length+'</em></button>'}).join("")+'</div></section>'}).join("");tree.querySelectorAll("[data-group]").forEach(function(button){button.onclick=function(){var key=button.dataset.group;state.expandedGroups[key]=state.expandedGroups[key]===false;renderTree()}});tree.querySelectorAll("[data-thread]").forEach(function(button){button.onclick=function(){state.selectedThreadId=button.dataset.thread||"";persist();render()}})}
    function todoRow(todo){var actions='<span class="statusText">'+esc(labels[todo.status]||todo.status)+'</span>';if(todo.status==="completed"&&todo.completionThreadId&&todo.completionTurnId)actions+='<button class="button miniButton" type="button" data-result="'+esc(todo.id)+'">'+icon("result")+'查看结果</button>';if(todo.status==="failed")actions+='<button class="button miniButton" type="button" data-retry="'+esc(todo.id)+'">'+icon("retry")+'重试</button>';return'<div class="todoRow"><i class="statusDot '+esc(todo.status)+'"></i><div class="todoCopy"><strong>'+esc(todo.title)+'</strong>'+(todo.description?'<span>'+esc(todo.description)+'</span>':'')+'</div><div class="todoActions">'+actions+'</div></div>'}
    function renderWorkspace(){var workspace=document.getElementById("workspace"),thread=selectedThread(),binding=bindingFor(thread);if(!thread||!binding){workspace.innerHTML='<div class="empty">'+icon("thread")+'<strong>还没有关联的 task</strong><p>从左侧新增一个 Codex task。</p><button class="button primary" id="workspaceAdd" type="button">'+icon("plus")+'新增关联</button></div>';document.getElementById("workspaceAdd").onclick=openPicker;return}var todos=todosFor(binding),active=activeCount(todos),group=groupFor(thread);workspace.innerHTML='<header class="taskHeader"><div class="taskHeading"><h1>'+esc(thread.name)+'</h1><p>'+icon("folder")+esc(group.name)+'</p></div><span class="statusSummary '+(active?'active':'')+'"><i></i>'+(active?active+' 个运行中':'队列空闲')+'</span></header><form class="composer" id="composer"><input class="input" id="todoTitle" placeholder="写下一件要交给 Codex 的事…" autocomplete="off" aria-label="Todo 标题"><button class="button primary" type="submit" '+(state.busy?'disabled':'')+'>'+icon("plus")+'加入队列</button></form><section class="todoSection"><div class="sectionTitle"><strong>Todo</strong><span>'+todos.length+' 项</span></div>'+(todos.length?'<div class="todoList">'+todos.map(todoRow).join("")+'</div>':'<div class="empty">'+icon("thread")+'<strong>还没有 Todo</strong><p>写下一件事，它会发送到当前 task。</p></div>')+'</section>';document.getElementById("composer").onsubmit=function(event){event.preventDefault();void addTodo(binding)};workspace.querySelectorAll("[data-result]").forEach(function(button){button.onclick=function(){void openReceipt(button.dataset.result)}});workspace.querySelectorAll("[data-retry]").forEach(function(button){button.onclick=function(){void retryTodo(button.dataset.retry)}})}
    function render(){if(!state.overview)return;ensureSelection();renderConnection();renderTree();renderWorkspace();renderModal();syncActivePolling();if(window.openai&&typeof window.openai.notifyIntrinsicHeight==="function")window.openai.notifyIntrinsicHeight(document.documentElement.scrollHeight)}
    function refresh(silent){if(refreshPromise)return refreshPromise;refreshPromise=(async function(){try{var response=await callTool("get_overview",{}),data=overview(response);if(!data)throw new Error("未收到 Todo 数据");state.overview=data;render();if(!silent)toast("已刷新")}catch(error){if(!silent)toast(friendly(error),true)}finally{refreshPromise=null;syncActivePolling()}})();return refreshPromise}
    function uniqueProjectName(base,thread){var names=state.overview.projects.map(function(project){return project.name.toLowerCase()}),candidate=base;if(names.indexOf(candidate.toLowerCase())<0)return candidate;candidate=base+" · "+thread.name;if(names.indexOf(candidate.toLowerCase())<0)return candidate;var index=2;while(names.indexOf((candidate+" "+index).toLowerCase())>=0)index+=1;return candidate+" "+index}
    async function bindThread(thread){if(state.busy||bindingFor(thread))return;state.busy=true;renderModal();try{var root=normalizePath(thread.cwd),reusable=state.overview.projects.find(function(project){return normalizePath(project.rootPath)===root&&!project.targetThreadId});if(reusable)await callTool("update_project",{projectId:reusable.id,targetThreadId:thread.id,autoDispatch:true});else{var codexProject=codexProjectFor(thread),name=uniqueProjectName(codexProject?codexProject.name:thread.name,thread);await callTool("create_project",{name:name,rootPath:thread.cwd,targetThreadId:thread.id,autoDispatch:true})}state.selectedThreadId=thread.id;persist();await refresh(true);closeModal();toast("task 已关联")}catch(error){toast(friendly(error),true)}finally{state.busy=false;render()}}
    async function addTodo(binding){var input=document.getElementById("todoTitle"),title=input?input.value.trim():"";if(!title){toast("先写下一件事",true);return}state.busy=true;renderWorkspace();try{await callTool("add_todo",{title:title,projectId:binding.id,status:"ready"});await refresh(true);toast("已加入队列")}catch(error){toast(friendly(error),true)}finally{state.busy=false;renderWorkspace()}}
    async function retryTodo(todoId){if(state.busy)return;state.busy=true;renderWorkspace();try{await callTool("retry_todo",{todoId:todoId});await refresh(true);toast("已重新加入队列")}catch(error){toast(friendly(error),true)}finally{state.busy=false;renderWorkspace()}}
    function syncActivePolling(){if(pollTimer){clearTimeout(pollTimer);pollTimer=null}if(document.hidden||state.modal||!hasActiveTodo())return;pollTimer=setTimeout(function(){pollTimer=null;if(document.hidden||state.modal)return;void refresh(true)},2500)}
    function openPicker(){modalReturnFocus=document.activeElement;state.modal="picker";state.pickerQuery="";syncActivePolling();renderModal()}
    function closeModal(){var focus=modalReturnFocus;modalReturnFocus=null;state.modal="";state.pickerQuery="";state.receiptTodoId="";state.receiptResult=null;state.receiptLoading=false;state.receiptError="";renderModal();syncActivePolling();if(focus&&focus.isConnected&&typeof focus.focus==="function")focus.focus()}
    function renderPickerList(){var list=document.getElementById("pickerList");if(!list||!state.overview)return;var query=state.pickerQuery.trim().toLowerCase(),threads=state.overview.codexThreads.filter(function(thread){var project=groupFor(thread);return!query||[thread.name,thread.cwd,project.name].join(" ").toLowerCase().indexOf(query)>=0}),groups=groupEntries(threads.map(function(thread){return{thread:thread,binding:bindingFor(thread)}}));if(!groups.length){list.innerHTML='<div class="pickerEmpty">没有匹配的项目或 Codex task</div>';return}list.innerHTML=groups.map(function(group){var expanded=Boolean(query)||!state.pickerCollapsedGroups[group.key];return'<section class="pickerGroup" data-slot="accordion-item"><button data-slot="accordion-trigger" class="pickerProjectToggle '+(expanded?'expanded':'')+'" type="button" data-picker-group="'+esc(group.key)+'" aria-expanded="'+expanded+'">'+icon("chevron")+icon("folder")+'<span>'+esc(group.name)+'</span><em>'+group.entries.length+'</em></button><div data-slot="accordion-content" class="pickerThreads '+(expanded?'expanded':'')+'" aria-hidden="'+(!expanded)+'" '+(expanded?'':'inert')+'>'+group.entries.map(function(entry){var linked=Boolean(entry.binding);return'<button data-slot="item" class="pickerThread" type="button" title="'+esc(entry.thread.cwd)+'" data-bind="'+esc(entry.thread.id)+'" '+(linked||state.busy?'disabled':'')+'>'+icon("thread")+'<strong>'+esc(entry.thread.name)+'</strong>'+(linked?'<em>'+icon("check")+'已关联</em>':'')+'</button>'}).join("")+'</div></section>'}).join("");list.querySelectorAll("[data-picker-group]").forEach(function(button){button.onclick=function(){var key=button.dataset.pickerGroup;state.pickerCollapsedGroups[key]=!state.pickerCollapsedGroups[key];renderPickerList()}});list.querySelectorAll("[data-bind]").forEach(function(button){button.onclick=function(){var thread=state.overview.codexThreads.find(function(candidate){return candidate.id===button.dataset.bind});if(thread)void bindThread(thread)}})}
    function pickerModal(layer){layer.innerHTML='<div data-slot="dialog-overlay" class="overlay" id="modalOverlay"><section data-slot="dialog-content" class="dialog" role="dialog" aria-modal="true" aria-labelledby="pickerTitle"><header data-slot="dialog-header" class="dialogHeader"><h2 id="pickerTitle">关联 Codex task</h2><button class="iconButton" id="closeModal" type="button" aria-label="关闭">'+icon("close")+'</button></header><label class="pickerSearch">'+icon("search")+'<input data-slot="input" class="input" id="pickerSearch" type="search" placeholder="搜索项目或 task" autocomplete="off" aria-label="搜索可关联的项目或 Codex task"></label><div class="pickerList" id="pickerList"></div></section></div>';document.getElementById("closeModal").onclick=closeModal;document.getElementById("modalOverlay").onclick=function(event){if(event.target===event.currentTarget)closeModal()};var search=document.getElementById("pickerSearch");search.oninput=function(){state.pickerQuery=search.value;renderPickerList()};renderPickerList();search.focus()}
    function receiptModal(layer){var todo=state.overview.todos.find(function(item){return item.id===state.receiptTodoId});if(!todo){closeModal();return}var body;if(state.receiptLoading)body='<div class="loading"><div class="spinner"></div><span>正在读取执行结果…</span></div>';else if(state.receiptError)body='<div class="empty"><strong>结果暂时不可用</strong><p>'+esc(state.receiptError)+'</p></div>';else{var answer=state.receiptResult&&state.receiptResult.answer?state.receiptResult.answer:"这次没有留下可展示的 AI 回复。",artifacts=state.receiptResult&&Array.isArray(state.receiptResult.artifacts)?state.receiptResult.artifacts:[],rows=artifacts.map(function(artifact){return'<li class="artifact">'+icon(artifact.kind==="file"?"file":"link")+'<span><strong>'+esc(artifact.name||"产出物")+'</strong><code title="'+esc(artifact.uri||"")+'">'+esc(artifact.uri||"")+'</code></span></li>'}).join("");body='<section class="resultSection"><h3>AI 回复</h3><div class="answer">'+esc(answer)+'</div></section><section class="resultSection"><h3>产出物</h3>'+(rows?'<ul class="artifactList">'+rows+'</ul>':'<div class="empty"><p>这次没有生成文件或链接。</p></div>')+'</section>'}layer.innerHTML='<div class="overlay" id="modalOverlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="receiptTitle"><header class="dialogHeader"><h2 id="receiptTitle">'+esc(todo.title)+'</h2><button class="iconButton" id="closeModal" type="button" aria-label="关闭">'+icon("close")+'</button></header>'+body+'</section></div>';document.getElementById("closeModal").onclick=closeModal;document.getElementById("modalOverlay").onclick=function(event){if(event.target===event.currentTarget)closeModal()};document.getElementById("closeModal").focus()}
    function renderModal(){var layer=document.getElementById("modalLayer");if(state.modal==="picker")pickerModal(layer);else if(state.modal==="receipt")receiptModal(layer);else layer.innerHTML=""}
    async function openReceipt(todoId){modalReturnFocus=document.activeElement;state.modal="receipt";state.receiptTodoId=todoId;state.receiptResult=null;state.receiptLoading=true;state.receiptError="";syncActivePolling();renderModal();try{var response=await callTool("get_todo_result",{todoId:todoId}),result=value(response);if(state.receiptTodoId!==todoId)return;if(!result||typeof result.answer!=="string"||!Array.isArray(result.artifacts))throw new Error("未收到可展示的执行结果");state.receiptResult=result}catch(error){if(state.receiptTodoId===todoId)state.receiptError=friendly(error)}finally{if(state.receiptTodoId===todoId){state.receiptLoading=false;renderModal()}}}
    document.getElementById("newBinding").onclick=openPicker;window.addEventListener("message",function(event){if(event.source!==window.parent)return;var message=event.data;if(!message||message.jsonrpc!=="2.0")return;if(message.id!==undefined&&pending.has(message.id)){var requestState=pending.get(message.id);pending.delete(message.id);if(message.error)requestState.reject(new Error(message.error.message||"工具调用失败"));else requestState.resolve(message.result)}},{passive:true});document.addEventListener("visibilitychange",syncActivePolling,{passive:true});document.addEventListener("keydown",function(event){if(event.key==="Escape"&&state.modal)closeModal()});restore();var initial=overview(window.openai&&window.openai.toolOutput);if(initial){state.overview=initial;render()}else setTimeout(function(){void refresh(true)},200);
  })();
  </script>
</body>
</html>`;
