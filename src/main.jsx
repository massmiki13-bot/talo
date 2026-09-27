import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Fix: NotFoundError during React commit-phase DOM operations.
// Radix UI portals (Dialog, Select, etc.) render to document.body.
// When navigating with a dialog/animation in-flight, React's commit-phase
// may try to removeChild or insertBefore a node already removed by Radix's
// own cleanup or a browser extension. This throws NotFoundError and freezes
// the app. Patch both methods to silently handle already-removed nodes.
const nativeRemoveChild = Node.prototype.removeChild;
Node.prototype.removeChild = function (child) {
  try {
    return nativeRemoveChild.call(this, child);
  } catch (e) {
    if (e && (e.name === 'NotFoundError' || e.code === 8)) {
      return child;
    }
    throw e;
  }
};

const nativeInsertBefore = Node.prototype.insertBefore;
Node.prototype.insertBefore = function (newNode, referenceNode) {
  try {
    return nativeInsertBefore.call(this, newNode, referenceNode);
  } catch (e) {
    if (e && (e.name === 'NotFoundError' || e.code === 8)) {
      // The reference node or parent was already removed — append instead,
      // or just return the node if the parent itself is detached.
      try {
        return nativeInsertBefore.call(this, newNode, null);
      } catch (e2) {
        return newNode;
      }
    }
    throw e;
  }
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)