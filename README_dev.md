# Move Abs Elems – Setup (Development) and Usage

## 1. VS Code Extension Setup

### Installation

See `install.txt` for installation instructions.

---

### Running the Extension

If you have generated a `.vsix` file, simply install and use that package.

If you do not generate a `.vsix`, you can run the extension in debug mode as follows:

1. Open this folder in VS Code
2. Press `F5` to launch the Extension Development Host
3. A new VS Code window will open with the extension activated
4. The server will automatically start on port **37842**

---

### Commands

* `Quarto: Start Drag Position Server` – Manually start the server
* `Quarto: Stop Drag Position Server` – Stop the server

---

## 2. Quarto Extension Setup

See `README.md` for details.

### Enable in Your Project

Add the following to your `_quarto.yml` or to the YAML header of each `.qmd` file:

```yaml
---
filters:
  - mov-abs-elems
---
```

---

## 3. Troubleshooting

### Cannot Connect to the Server

* Make sure the VS Code extension is running
* If you see “VSCode server is not running” in the console, start debug mode with `F5`
* Ensure only **one** VS Code instance is running
* Check that none of the limitations described in `README.md` apply to your setup

---

### Coordinates Are Not Updated

1. Check the browser console for error messages
2. Check the extension logs in the VS Code **Output** panel
3. Confirm that the regular expression pattern matches the target element

---

## 4. Customization

### Changing the Port Number

Modify `37842` in both:

* `extension.ts`
* `mov-abs-elems.js`

---

### Adding Snap-to-Grid Behavior

Modify the `onMouseUp` function in `mov-abs-elems.js`:

```javascript
// Snap to 5% increments
const roundedLeft = Math.round(finalLeft / 5) * 5;
const roundedTop = Math.round(finalTop / 5) * 5;
```

---

### Displaying a Grid Overlay

To display a grid in the preview, add the following to `mov-abs-elems.js`:

```javascript
function showGrid() {
  const grid = document.createElement('div');
  grid.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-size: 10% 10%;
    background-image: 
      linear-gradient(to right, rgba(0,0,0,0.1) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(0,0,0,0.1) 1px, transparent 1px);
    pointer-events: none;
    z-index: 9998;
  `;
  document.body.appendChild(grid);
}
```
