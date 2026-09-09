import { Game } from './core/Game';

const game = new Game();
game.init().then(() => game.start());
