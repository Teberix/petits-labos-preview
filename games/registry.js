// Game registry — the hub shows one tile per entry, in this order.
//
// To add a game: create games/<id>/ with meta.js + its code, then add ONE line below.
// A game module's default export must look like:
//   { mount(container, ctx) { … }, unmount() { … } }
// `ctx` is described in js/screens/game.js.
import potion from './potion/meta.js';
import robot from './robot/meta.js';
import market from './market/meta.js';
import train from './train/meta.js';
import balance from './balance/meta.js';
import food from './food/meta.js';
import shapes from './shapes/meta.js';
import memory from './memory/meta.js';
import jaguar from './jaguar/meta.js';

export const GAMES = [
  { ...potion, load: () => import('./potion/potion.js') },
  { ...robot, load: () => import('./robot/robot.js') },
  { ...market, load: () => import('./market/market.js') },
  { ...train, load: () => import('./train/train.js') },
  { ...balance, load: () => import('./balance/balance.js') },
  { ...food, load: () => import('./food/food.js') },
  { ...shapes, load: () => import('./shapes/shapes.js') },
  { ...memory, load: () => import('./memory/memory.js') },
  { ...jaguar, load: () => import('./jaguar/jaguar.js') },
];
