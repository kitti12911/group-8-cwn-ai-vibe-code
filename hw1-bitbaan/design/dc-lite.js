/*
 * dc-lite.js — ตัวแสดงผลขนาดเล็กสำหรับหน้าดีไซน์บิตบ้าน
 * อ่าน template จาก <script type="text/x-template" id="dc-template">
 * และ logic จาก <script type="text/x-dc"> แล้ววาดลงใน #dc-root
 * รองรับ {{path}}, <sc-for list as>, <sc-if value>, onClick/onChange และ setState
 */
(function (global) {
  'use strict';

  var BOOL_ATTRS = { checked: 1, disabled: 1, selected: 1, readonly: 1, required: 1 };
  var handlers = [];

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function stripBraces(v) {
    var m = /^\s*\{\{\s*([\s\S]+?)\s*\}\}\s*$/.exec(v || '');
    return m ? m[1] : v;
  }

  function lookup(path, scope) {
    path = String(path).trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^'.*'$|^".*"$/.test(path)) return path.slice(1, -1);
    var parts = path.split('.');
    var v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }

  function parseAttrs(s) {
    var out = {}, re = /([\w-]+)="([^"]*)"/g, m;
    while ((m = re.exec(s))) out[m[1]] = m[2];
    return out;
  }

  function eventName(attr) {
    var n = attr.slice(2).toLowerCase();
    return n === 'doubleclick' ? 'dblclick' : n;
  }

  function subst(s, scope) {
    s = s.replace(/\shint-[\w-]+="[^"]*"/g, '');
    s = s.replace(/\s([a-zA-Z][\w-]*)="\{\{\s*([^}]+?)\s*\}\}"/g, function (all, name, path) {
      var v = lookup(path, scope);
      if (/^on[A-Z]/.test(name)) {
        if (typeof v !== 'function') return '';
        handlers.push(v);
        return ' data-dcon-' + eventName(name) + '="' + (handlers.length - 1) + '"';
      }
      if (BOOL_ATTRS[name]) return v ? ' ' + name : '';
      if (v === false || v == null) return '';
      if (name === 'class') name = 'class';
      return ' ' + name + '="' + esc(v) + '"';
    });
    return s.replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (all, path) {
      var v = lookup(path, scope);
      return v == null ? '' : esc(v);
    });
  }

  function renderStr(s, scope) {
    var out = '', i = 0;
    var open = /<sc-(for|if)\b([^>]*)>/g;
    for (;;) {
      open.lastIndex = i;
      var r = open.exec(s);
      if (!r) { out += subst(s.slice(i), scope); break; }
      out += subst(s.slice(i, r.index), scope);
      var tag = 'sc-' + r[1];
      var re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'g');
      re.lastIndex = open.lastIndex;
      var depth = 1, mm;
      while (depth > 0) {
        mm = re.exec(s);
        if (!mm) throw new Error('ไม่พบ </' + tag + '>');
        depth += mm[1] ? -1 : 1;
      }
      var body = s.slice(open.lastIndex, mm.index);
      var attrs = parseAttrs(r[2]);
      if (r[1] === 'if') {
        if (lookup(stripBraces(attrs.value), scope)) out += renderStr(body, scope);
      } else {
        var list = lookup(stripBraces(attrs.list), scope) || [];
        var as = attrs.as || 'item';
        for (var k = 0; k < list.length; k++) {
          var child = Object.create(scope);
          child[as] = list[k];
          child.$index = k;
          out += renderStr(body, child);
        }
      }
      i = re.lastIndex;
    }
    return out;
  }

  /* morph: อัปเดต DOM เดิมให้ตรงกับของใหม่ โดยไม่ทิ้ง focus หรือค่าที่ผู้ใช้เลือกไว้ */
  function morph(a, b) {
    if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) { a.replaceWith(b); return; }
    if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    var i, at;
    var olds = Array.prototype.slice.call(a.attributes);
    for (i = 0; i < olds.length; i++) {
      if (!b.hasAttribute(olds[i].name)) {
        a.removeAttribute(olds[i].name);
        if (olds[i].name === 'checked') a.checked = false;
      }
    }
    var news = Array.prototype.slice.call(b.attributes);
    for (i = 0; i < news.length; i++) {
      at = news[i];
      if (a.getAttribute(at.name) !== at.value) {
        a.setAttribute(at.name, at.value);
        if (at.name === 'checked') a.checked = true;
        if (at.name === 'value') a.value = at.value;
      }
    }
    morphChildren(a, b);
  }

  function morphChildren(a, b) {
    var ac = Array.prototype.slice.call(a.childNodes);
    var bc = Array.prototype.slice.call(b.childNodes);
    for (var k = 0; k < bc.length; k++) {
      if (k < ac.length) morph(ac[k], bc[k]);
      else a.appendChild(bc[k]);
    }
    for (k = bc.length; k < ac.length; k++) ac[k].remove();
  }

  function DCLogic(props) {
    this.props = props || {};
    this.state = {};
  }
  DCLogic.prototype.setState = function (patch) {
    var next = typeof patch === 'function' ? patch(this.state, this.props) : patch;
    this.state = Object.assign({}, this.state, next);
    if (this.__render) this.__render();
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__render) this.__render(); };
  DCLogic.prototype.renderVals = function () { return {}; };

  function boot() {
    var tplEl = document.getElementById('dc-template');
    var root = document.getElementById('dc-root');
    var logicEl = document.querySelector('script[type="text/x-dc"]');
    if (!tplEl || !root) return;
    var tpl = tplEl.textContent;
    var Component = logicEl
      ? new Function('DCLogic', logicEl.textContent + '\n;return Component;')(DCLogic)
      : DCLogic;
    var inst = new Component({});
    if (!inst.state) inst.state = {};

    function render() {
      handlers = [];
      var html = renderStr(tpl, inst.renderVals() || {});
      var holder = document.createElement('div');
      holder.innerHTML = html;
      morphChildren(root, holder);
    }
    inst.__render = render;

    ['click', 'change', 'input', 'submit', 'keydown', 'focusout'].forEach(function (type) {
      root.addEventListener(type, function (e) {
        var el = e.target.closest && e.target.closest('[data-dcon-' + type + ']');
        if (!el || !root.contains(el)) return;
        var fn = handlers[Number(el.getAttribute('data-dcon-' + type))];
        if (fn) fn(e);
      });
    });

    render();
    if (typeof inst.componentDidMount === 'function') inst.componentDidMount();
    window.addEventListener('beforeunload', function () {
      if (typeof inst.componentWillUnmount === 'function') inst.componentWillUnmount();
    });
  }

  global.DCLite = { renderStr: renderStr, lookup: lookup, DCLogic: DCLogic };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
