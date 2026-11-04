let container: HTMLElement | null = null;

export function initToasts(parent: HTMLElement): void {
  container = document.createElement('div');
  container.className = 'toast-container';
  parent.appendChild(container);
}

export function showToast(message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info'): void {
  if (!container) {
    container = document.querySelector('.toast-container');
    if (!container) return;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

