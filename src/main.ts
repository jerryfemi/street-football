import './style.css';
import { Game } from './core/Game';

const app = document.getElementById('app')!;
const game = new Game(app);
game.start().catch((err) => {
  console.error(err);
  app.textContent = 'Failed to start - check the console.';
});
