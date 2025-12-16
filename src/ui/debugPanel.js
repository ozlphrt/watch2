/**
 * Debug Panel - Control and save/watch variables
 * Per CURSOR_RULES.md §8: Dark glassmorphic panels, hover-drag numeric inputs
 */

export class DebugPanel {
  constructor() {
    this.panel = null;
    this.isVisible = false;
    this.controls = {};
    this.callbacks = {};
    this.createPanel();
    this.setupKeyboardShortcut();
  }

  setupKeyboardShortcut() {
    // CTRL+Shift+Alt+D toggles debug panel
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  createPanel() {
    // Main panel container
    this.panel = document.createElement('div');
    this.panel.id = 'debug-panel';
    this.panel.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 320px;
      max-height: 80vh;
      overflow-y: auto;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(10px);
      border-radius: 12px;
      padding: 16px;
      color: #fff;
      font-size: 12px;
      z-index: 1000;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      display: none;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 8px;';
    
    const title = document.createElement('h3');
    title.textContent = 'Debug Panel';
    title.style.cssText = 'margin: 0; font-size: 16px; font-weight: 600;';
    
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '×';
    toggleBtn.style.cssText = 'background: none; border: none; color: #fff; font-size: 24px; cursor: pointer; padding: 0 8px;';
    toggleBtn.onclick = () => this.toggle();
    
    header.appendChild(title);
    header.appendChild(toggleBtn);
    this.panel.appendChild(header);

    // Content container
    this.content = document.createElement('div');
    this.panel.appendChild(this.content);

    // Save/Load buttons
    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.2);';
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.cssText = 'flex: 1; padding: 8px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; color: #fff; cursor: pointer;';
    saveBtn.onclick = () => this.save();
    
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.className = 'debug-copy-btn';
    copyBtn.style.cssText = 'flex: 1; padding: 8px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; color: #fff; cursor: pointer;';
    copyBtn.onclick = () => this.copyToClipboard();
    
    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Load';
    loadBtn.style.cssText = 'flex: 1; padding: 8px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; color: #fff; cursor: pointer;';
    loadBtn.onclick = () => this.load();
    
    actions.appendChild(saveBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(loadBtn);
    this.panel.appendChild(actions);

    document.body.appendChild(this.panel);
  }

  addSection(title) {
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom: 16px;';
    
    const sectionTitle = document.createElement('h4');
    sectionTitle.textContent = title;
    sectionTitle.style.cssText = 'margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #aaa; text-transform: uppercase;';
    section.appendChild(sectionTitle);
    
    const sectionContent = document.createElement('div');
    sectionContent.className = 'section-content';
    section.appendChild(sectionContent);
    
    this.content.appendChild(section);
    return sectionContent;
  }

  addControl(label, value, min, max, step, callback, section) {
    const control = document.createElement('div');
    control.style.cssText = 'margin-bottom: 12px;';
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = 'display: block; margin-bottom: 4px; font-size: 11px; color: #ccc;';
    
    const inputContainer = document.createElement('div');
    inputContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;';
    
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step || 0.01;
    input.value = value;
    input.style.cssText = 'flex: 1;';
    
    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = value.toFixed(2);
    valueDisplay.style.cssText = 'min-width: 50px; text-align: right; font-family: monospace; font-size: 11px;';
    
    input.oninput = (e) => {
      const val = parseFloat(e.target.value);
      valueDisplay.textContent = val.toFixed(2);
      if (callback) callback(val);
    };
    
    // Hover-drag support (per CURSOR_RULES.md §8.3)
    let isDragging = false;
    input.addEventListener('mousedown', () => isDragging = true);
    input.addEventListener('mouseup', () => isDragging = false);
    input.addEventListener('mouseleave', () => isDragging = false);
    
    inputContainer.appendChild(input);
    inputContainer.appendChild(valueDisplay);
    
    control.appendChild(labelEl);
    control.appendChild(inputContainer);
    
    if (section) {
      section.appendChild(control);
    } else {
      this.content.appendChild(control);
    }
    
    this.controls[label] = { input, valueDisplay, callback };
    return { input, valueDisplay };
  }

  addColorControl(label, value, callback, section) {
    const control = document.createElement('div');
    control.style.cssText = 'margin-bottom: 12px;';
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = 'display: block; margin-bottom: 4px; font-size: 11px; color: #ccc;';
    
    const inputContainer = document.createElement('div');
    inputContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;';
    
    const input = document.createElement('input');
    input.type = 'color';
    input.value = '#' + value.toString(16).padStart(6, '0');
    input.style.cssText = 'width: 50px; height: 30px; border: none; border-radius: 4px; cursor: pointer;';
    
    input.onchange = (e) => {
      const val = parseInt(e.target.value.replace('#', ''), 16);
      if (callback) callback(val);
    };
    
    inputContainer.appendChild(input);
    
    control.appendChild(labelEl);
    control.appendChild(inputContainer);
    
    if (section) {
      section.appendChild(control);
    } else {
      this.content.appendChild(control);
    }
    
    this.controls[label] = { input, callback };
    return { input };
  }

  addCheckbox(label, value, callback, section) {
    const control = document.createElement('div');
    control.style.cssText = 'margin-bottom: 12px; display: flex; align-items: center; gap: 8px;';
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.style.cssText = 'cursor: pointer;';
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size: 11px; color: #ccc; cursor: pointer;';
    labelEl.onclick = () => input.click();
    
    input.onchange = (e) => {
      if (callback) callback(e.target.checked);
    };
    
    control.appendChild(input);
    control.appendChild(labelEl);
    
    if (section) {
      section.appendChild(control);
    } else {
      this.content.appendChild(control);
    }
    
    this.controls[label] = { input, callback };
    return { input };
  }

  toggle() {
    this.isVisible = !this.isVisible;
    this.panel.style.display = this.isVisible ? 'block' : 'none';
  }

  show() {
    this.isVisible = true;
    this.panel.style.display = 'block';
  }

  hide() {
    this.isVisible = false;
    this.panel.style.display = 'none';
  }

  getCurrentValues() {
    const data = {};
    for (const [key, control] of Object.entries(this.controls)) {
      if (control.input.type === 'checkbox') {
        data[key] = control.input.checked;
      } else if (control.input.type === 'color') {
        data[key] = parseInt(control.input.value.replace('#', ''), 16);
      } else {
        data[key] = parseFloat(control.input.value);
      }
    }
    return data;
  }

  save() {
    const data = this.getCurrentValues();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'debug-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async copyToClipboard() {
    const data = this.getCurrentValues();
    const json = JSON.stringify(data, null, 2);
    const copyBtn = this.panel.querySelector('.debug-copy-btn');
    const originalText = copyBtn.textContent;
    
    try {
      await navigator.clipboard.writeText(json);
      // Show feedback
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = originalText;
      }, 1000);
    } catch (err) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = json;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = originalText;
        }, 1000);
      } catch (fallbackErr) {
        alert('Failed to copy to clipboard');
      }
      document.body.removeChild(textarea);
    }
  }

  load() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);
            for (const [key, value] of Object.entries(data)) {
              if (this.controls[key]) {
                const control = this.controls[key];
                if (control.input.type === 'checkbox') {
                  control.input.checked = value;
                  if (control.callback) control.callback(value);
                } else if (control.input.type === 'color') {
                  control.input.value = '#' + value.toString(16).padStart(6, '0');
                  if (control.callback) control.callback(value);
                } else {
                  control.input.value = value;
                  if (control.valueDisplay) control.valueDisplay.textContent = value.toFixed(2);
                  if (control.callback) control.callback(value);
                }
              }
            }
          } catch (err) {
            alert('Error loading file: ' + err.message);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }
}

