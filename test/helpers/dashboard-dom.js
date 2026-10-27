export function makeDashboardDom(html) {
  const ids = new Map();
  let document;
  const decode = text => text.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag; this.children = []; this.style = {}; this.attrs = {}; this.listeners = {};
      this._text = ''; this._value = null; this.hidden = false; this.disabled = false; this.checked = false; this.open = false;
    }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set value(value) { this._value = String(value); }
    get value() { return this._value ?? (this.tagName === 'select' ? this.children[0]?.value || '' : ''); }
    get selectedOptions() { return this.children.filter(child => child.value === this.value); }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    prepend(child) { child.parentNode = this; this.children.unshift(child); }
    setAttribute(key, value) {
      this.attrs[key] = String(value);
      if (key === 'id') { this.id = String(value); ids.set(this.id, this); }
      if (key === 'class') this.className = String(value);
      if (key === 'value') this.value = value;
      if (key === 'type') this.type = value;
      if (key === 'disabled') this.disabled = true;
      if (key === 'hidden') this.hidden = true;
    }
    getAttribute(key) { return this.attrs[key] ?? null; }
    removeAttribute(key) { delete this.attrs[key]; }
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
    async fire(type, extra = {}) { for (const handler of this.listeners[type] || []) await handler.call(this, { preventDefault() {}, currentTarget: this, ...extra }); }
    click() { return this.fire('click'); }
    matches(selector) {
      if (selector === '*') return true;
      if (selector === 'input:checked') return this.tagName === 'input' && this.checked;
      const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
      if (attr) return Object.hasOwn(this.attrs, attr[1]) && (attr[2] === undefined || this.attrs[attr[1]] === attr[2]);
      const [tag, cls] = selector.split('.');
      return (!tag || this.tagName === tag) && (!cls || (this.className || '').split(' ').includes(cls));
    }
    querySelectorAll(selector) { return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(child => child.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0]; }
    showModal() { this.open = true; }
    close() { this.open = false; this.fire('close'); }
    reset() {}
    focus() { document.activeElement = this; this.focused = true; }
    select() { this.selected = true; }
  }
  const root = new Element('html'), stack = [root];
  const voids = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);
  for (const token of html.matchAll(/<[^>]+>|[^<]+/g)) {
    const text = token[0];
    if (text.startsWith('</')) { stack.pop(); continue; }
    if (text.startsWith('<')) {
      const match = text.match(/^<([\w-]+)([\s\S]*?)>$/);
      if (!match) continue;
      const element = new Element(match[1]);
      for (const attribute of match[2].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) element.setAttribute(attribute[1], decode(attribute[2] || ''));
      stack.at(-1).appendChild(element);
      if (!voids.has(element.tagName)) stack.push(element);
    } else stack.at(-1)._text += decode(text);
  }
  document = {
    documentElement: root, activeElement: null, title: '', getElementById: id => ids.get(id),
    querySelectorAll: selector => root.querySelectorAll(selector), createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag),
  };
  return { document, $: id => ids.get(id), Element };
}
