// What the hub needs to know about "Le Petit Jaguar" without loading the whole game.
export default {
  id: 'jaguar',
  // Non-linguistic game → played in the app language (French by default).
  titleKey: 'jaguar.title',
  // New engine: the path screen (js/path.js). No scene: this game gives no world of its own.
  path: true,
  steps: 8, // difficulty steps of the path (= maxStep of its levels; a unit test checks it)
  strings: {
    fr: { 'jaguar.title': 'Le Petit Jaguar' },
    es: { 'jaguar.title': 'El Pequeño Jaguar' },
    en: { 'jaguar.title': 'Little Jaguar' },
  },
  // Tile art: a spotted jaguar face above a little maze corner.
  icon: `<svg viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="26" cy="24" r="9" fill="#E8A33C"/><circle cx="74" cy="24" r="9" fill="#E8A33C"/>
    <circle cx="50" cy="44" r="30" fill="#F2B84B"/>
    <circle cx="38" cy="38" r="4" fill="#4A5160"/><circle cx="62" cy="38" r="4" fill="#4A5160"/>
    <ellipse cx="50" cy="50" rx="6" ry="4" fill="#4A5160"/>
    <circle cx="36" cy="54" r="3" fill="#B8741A"/><circle cx="64" cy="54" r="3" fill="#B8741A"/>
    <path d="M12 94V80h22V88h18V80h36" fill="none" stroke="#3C7BE8" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
};
