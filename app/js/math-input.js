// Shared native text editing with a touch-friendly mathematical keyboard.
let activeInput = null;
const editors = new WeakMap();

export function normalizeMath(text) {
  return text.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ').replace(/[−－]/g, '-');
}
const valid = text => /^[\x20-\x7e\t\nπθ√≤≥≦≧×·÷−²³]*$/.test(text);

export function attachMathInput(input, onChange, notify) {
  input.lang = 'en';
  input.inputMode = 'text';
  input.autocapitalize = 'off';
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('enterkeyhint', 'next');
  let composing = false;
  let accepted = input.value;
  let selection = [0, 0];
  const remember = () => { selection = [input.selectionStart, input.selectionEnd]; };
  const commit = () => {
    const raw = input.value;
    const caret = normalizeMath(raw.slice(0, input.selectionStart)).length;
    const normalized = normalizeMath(raw);
    if (!valid(normalized)) {
      input.value = accepted;
      input.setSelectionRange(...selection);
      notify('数式は半角英数字または数式キーボードで入力してください。全角英数字は自動変換できます。');
      return;
    }
    input.value = normalized;
    input.setSelectionRange(caret, caret);
    accepted = normalized;
    remember();
    onChange();
  };
  input.addEventListener('focus', () => {
    activeInput = input;
    accepted = input.value;
    remember();
    document.querySelectorAll('.expr-row').forEach(el => el.classList.toggle('math-active', el.contains(input)));
  });
  input.addEventListener('select', remember);
  input.addEventListener('beforeinput', e => {
    if (!composing && !e.isComposing) remember();
    if (!composing && !e.isComposing && e.data && !valid(normalizeMath(e.data)) && e.cancelable) {
      e.preventDefault();
      notify('数式欄では日本語を入力できません。半角英数字で入力してください。');
    }
  });
  input.addEventListener('compositionstart', () => { composing = true; accepted = input.value; remember(); });
  input.addEventListener('compositionend', () => { composing = false; commit(); });
  input.addEventListener('input', e => { if (!composing && !e.isComposing) commit(); });
  editors.set(input, { commit, isComposing: () => composing });
}

export function createMathKeyboard(container) {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'math-keyboard-toggle';
  toggle.textContent = '数式キーボード';
  toggle.setAttribute('aria-expanded', 'true');
  toggle.setAttribute('aria-controls', 'math-keyboard');
  const keyboard = document.createElement('div');
  keyboard.id = 'math-keyboard';
  keyboard.setAttribute('role', 'group');
  keyboard.setAttribute('aria-label', '数式キーボード');
  const help = document.createElement('div');
  help.className = 'math-input-help';
  help.textContent = '式を選んで入力。指数は下の数式に上付きで表示されます。';
  const grid = document.createElement('div');
  grid.className = 'math-keys';
  const keys = [
    ['x','x'],['y','y'],['a','a'],['b','b'],['π','π'],['(', '('],[')', ')'],
    ['7','7'],['8','8'],['9','9'],['÷','/'],['x²','^2','2乗'],['xⁿ','^()','累乗',2],['√','sqrt()','平方根',5],
    ['4','4'],['5','5'],['6','6'],['×','*'],['sin','sin()','正弦',4],['cos','cos()','余弦',4],['tan','tan()','正接',4],
    ['1','1'],['2','2'],['3','3'],['−','-'],['log','log()','常用対数',4],['ln','ln()','自然対数',3],['|x|','abs()','絶対値',4],
    ['0','0'],['.','.'],['=','='],['+','+'],['≤','<='],['≥','>='],[',',','],
    ['←',null,'左へ'],['→',null,'右へ'],['⌫',null,'1文字削除'],['消去',null,'式を消去']
  ];
  for (const [label, text, name, offset] of keys) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', name || label);
    button.addEventListener('pointerdown', e => e.preventDefault());
    button.addEventListener('click', () => {
      const input = activeInput;
      if (!input?.isConnected) { help.textContent = '先に入力する式の欄を選んでください。'; return; }
      if (editors.get(input).isComposing()) return;
      input.focus();
      const start = input.selectionStart, end = input.selectionEnd;
      if (label === '←' || label === '→') {
        const pos = label === '←' ? Math.max(0, start - (start === end ? 1 : 0)) : Math.min(input.value.length, end + (start === end ? 1 : 0));
        input.setSelectionRange(pos, pos);
      } else {
        let caret;
        if (label === '消去') { input.value = ''; caret = 0; }
        else if (label === '⌫') {
          const from = start === end ? Math.max(0, start - 1) : start;
          input.setRangeText('', from, end, 'end'); caret = from;
        } else {
          const selected = input.value.slice(start, end);
          let insert = text;
          if (selected && (label === 'x²' || label === 'xⁿ')) insert = `(${selected})${text}`;
          else if (selected && text.endsWith('()')) insert = text.slice(0, -1) + selected + ')';
          input.setRangeText(insert, start, end, 'end');
          caret = start + (offset && !selected ? offset : insert.length);
          if (label === 'xⁿ' && selected) caret--;
        }
        input.setSelectionRange(caret, caret);
        editors.get(input).commit();
      }
    });
    grid.append(button);
  }
  keyboard.append(help, grid);
  toggle.addEventListener('click', () => { keyboard.hidden = !keyboard.hidden; toggle.setAttribute('aria-expanded', String(!keyboard.hidden)); });
  container.append(toggle, keyboard);
}
