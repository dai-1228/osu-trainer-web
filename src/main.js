


import { UI } from './ui.js';


const ui = new UI();
window.__ui = ui; 


window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

console.log('%cosu! trainer (web) ready', 'color:#f372b9;font-weight:700;font-size:14px');
console.log('%cDrop an .osz file to begin. Everything runs locally — your files never leave your browser.', 'color:#a79ae9');
