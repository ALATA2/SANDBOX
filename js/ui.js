import * as THREE from 'three';
import { game } from './game.js';
import { world } from './world.js';
import { player, toggleInventory, equipItem, syncHotbarCounts, isNearStation, getActiveAxe, getActivePickaxe } from './player.js';
import { getTranslation } from './lang.js';
import { playHover, playSelect } from './audio.js';
import { currentPreset, getCalendarState } from './weather.js';

// Local cache for DOM elements to avoid document lookups in animate/render loops
const domCache = {};
export function getDom(id) {
  if (!domCache[id]) {
    domCache[id] = document.getElementById(id);
  }
  return domCache[id];
}

const targetLoc = new THREE.Vector3(80, -5, -120);
const directionVec = new THREE.Vector3();

// Render Inventory Overlay Panels
export function renderInventoryUI() {
  // 1. Render My Bag Grid
  const bagGrid = getDom('inv-bag-grid');
  if (!bagGrid) return;
  bagGrid.innerHTML = '';

  // All inventory item definitions
  const items = [
    { id: 'wood', name: 'Wood', icon: '🪵', labelKey: 'hotbar.wood' },
    { id: 'stone', name: 'Stone', icon: '🪨', labelKey: 'hotbar.stone' },
    { id: 'leaves', name: 'Leaves', icon: '🍃', labelKey: 'hotbar.leaves' },
    { id: 'rope', name: 'Rope', icon: '🧵', labelKey: 'hotbar.rope' },
    { id: 'ore', name: 'Gold Ore', icon: '🪙', labelKey: 'hotbar.ore' },
    { id: 'raw_fish', name: 'Raw Fish', icon: '🐟', labelKey: 'inv.raw_fish' },
    { id: 'raw_crab', name: 'Raw Crab', icon: '🦀', labelKey: 'inv.raw_crab' },
    { id: 'worm', name: 'Worm', icon: '🐛', labelKey: 'inv.worm' },
    { id: 'cooked_meat', name: 'Cooked Meat', icon: '🍖', labelKey: 'inv.cooked_meat' },
    { id: 'egg', name: 'Egg', icon: '🥚', labelKey: 'inv.egg' },
    { id: 'cooked_egg', name: 'Cooked Egg', icon: '🍳', labelKey: 'inv.cooked_egg' },
    { id: 'fishing_rod', name: 'Fishing Rod', icon: '🎣', labelKey: 'inv.fishing_rod' },
    { id: 'campfire', name: 'Campfire', icon: '🔥', labelKey: 'inv.campfire' },
    { id: 'straw_hat', name: 'Straw Hat', icon: '👒', labelKey: 'inv.straw_hat' },
    { id: 'explorer_vest', name: 'Explorer Vest', icon: '🦺', labelKey: 'inv.explorer_vest' },
    { id: 'grass_pants', name: 'Grass Pants', icon: '👖', labelKey: 'inv.grass_pants' },
    { id: 'wooden_boots', name: 'Wooden Boots', icon: '🥾', labelKey: 'inv.wooden_boots' },
    { id: 'stick', name: 'Stick', icon: '🦯', labelKey: 'inv.stick' },
    { id: 'cane', name: 'Cane', icon: '🎋', labelKey: 'inv.cane' },
    { id: 'torch', name: 'Hand Torch', icon: '🔦', labelKey: 'inv.torch' },
    { id: 'berries', name: 'Wild Berries', icon: '🍒', labelKey: 'inv.berries' },
    
    // New progression items
    { id: 'sharp_stone', name: 'Sharp Stone', icon: '🪨', labelKey: 'inv.sharp_stone' },
    { id: 'plank', name: 'Plank', icon: '🪵', labelKey: 'inv.plank' },
    { id: 'stone_block', name: 'Stone Block', icon: '🧱', labelKey: 'inv.stone_block' },
    { id: 'primitive_spear', name: 'Bamboo Spear', icon: '⚔️', labelKey: 'inv.primitive_spear' },
    { id: 'primitive_axe', name: 'Primitive Axe', icon: '🪓', labelKey: 'inv.primitive_axe' },
    { id: 'primitive_pickaxe', name: 'Primitive Pickaxe', icon: '⛏️', labelKey: 'inv.primitive_pickaxe' },
    { id: 'refined_spear', name: 'Refined Spear', icon: '⚔️', labelKey: 'inv.refined_spear' },
    { id: 'refined_axe', name: 'Refined Axe', icon: '🪓', labelKey: 'inv.refined_axe' },
    { id: 'refined_pickaxe', name: 'Refined Pickaxe', icon: '⛏️', labelKey: 'inv.refined_pickaxe' },
    { id: 'workbench', name: 'Workbench', icon: '🛠️', labelKey: 'inv.workbench' },
    { id: 'furnace', name: 'Smelting Furnace', icon: '🧱', labelKey: 'inv.furnace' },
    { id: 'lab_table', name: 'Lab Table', icon: '🧪', labelKey: 'inv.lab_table' },
    
    { id: 'raw_silicon', name: 'Raw Silicon', icon: '🧪', labelKey: 'inv.raw_silicon' },
    { id: 'raw_copper', name: 'Raw Copper', icon: '🥉', labelKey: 'inv.raw_copper' },
    { id: 'raw_titanium', name: 'Raw Titanium', icon: '⚙️', labelKey: 'inv.raw_titanium' },
    { id: 'copper_ingot', name: 'Copper Ingot', icon: '🥉', labelKey: 'inv.copper_ingot' },
    { id: 'titanium_plate', name: 'Titanium Plate', icon: '⚙️', labelKey: 'inv.titanium_plate' },
    { id: 'glass', name: 'Glass', icon: '🥛', labelKey: 'inv.glass' },
    { id: 'spectrometer', name: 'Spectrometer', icon: '🔬', labelKey: 'inv.spectrometer' },
    { id: 'chemical_analyzer', name: 'Chemical Analyzer', icon: '🧪', labelKey: 'inv.chemical_analyzer' },
    { id: 'heat_suit', name: 'Heat Suit', icon: '🦺', labelKey: 'inv.heat_suit' }
  ];

  // Render items the player actually has
  let slotsCreated = 0;
  items.forEach(item => {
    const count = player.inventory[item.id] || 0;
    if (count > 0) {
      slotsCreated++;
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      
      const localizedName = getTranslation(item.labelKey) || item.name;
      slot.setAttribute('data-tooltip', localizedName);
      
      slot.innerHTML = `
        <span class="inv-slot-icon">${item.icon}</span>
        <span class="inv-slot-count">${count}</span>
      `;
      slot.addEventListener('click', () => {
        equipItem(item.id);
      });
      bagGrid.appendChild(slot);
    }
  });

  // Fill up to 20 slots with empty slots for clean grid aesthetics
  for (let i = slotsCreated; i < 20; i++) {
    const emptySlot = document.createElement('div');
    emptySlot.className = 'inv-slot empty';
    emptySlot.innerHTML = '';
    bagGrid.appendChild(emptySlot);
  }

  // 2. Render Crafting List
  const craftingList = getDom('inv-crafting-list');
  if (craftingList) {
    craftingList.innerHTML = '';
    const recipes = [
      // Tier 0: Hand-Crafted
      { id: 'sharp_stone', name: 'Sharp Stone', icon: '🪨', cost: { stone: 2 }, costText: '2 Stones', labelKey: 'inv.sharp_stone', descKey: 'recipe.sharp_stone', station: 'none' },
      { id: 'primitive_spear', name: 'Bamboo Spear', icon: '⚔️', cost: { cane: 1, sharp_stone: 1, rope: 1 }, costText: '1 Cane, 1 Sharp Stone, 1 Rope', labelKey: 'inv.primitive_spear', descKey: 'recipe.primitive_spear', station: 'none' },
      { id: 'primitive_axe', name: 'Primitive Axe', icon: '🪓', cost: { stick: 1, sharp_stone: 1, rope: 1 }, costText: '1 Stick, 1 Sharp Stone, 1 Rope', labelKey: 'inv.primitive_axe', descKey: 'recipe.primitive_axe', station: 'none' },
      { id: 'primitive_pickaxe', name: 'Primitive Pickaxe', icon: '⛏️', cost: { stick: 1, sharp_stone: 1, rope: 1 }, costText: '1 Stick, 1 Sharp Stone, 1 Rope', labelKey: 'inv.primitive_pickaxe', descKey: 'recipe.primitive_pickaxe', station: 'none' },
      
      // Tier 0.5: Processing
      { id: 'plank', name: 'Planks', icon: '🪵', cost: { wood: 1 }, costText: '1 Wood (Needs Axe)', labelKey: 'inv.plank', descKey: 'recipe.plank', station: 'none', tool: 'axe' },
      { id: 'stone_block', name: 'Stone Blocks', icon: '🧱', cost: { stone: 2 }, costText: '2 Stones (Needs Pickaxe)', labelKey: 'inv.stone_block', descKey: 'recipe.stone_block', station: 'none', tool: 'pickaxe' },
      
      // Tier 1: Structures
      { id: 'workbench', name: 'Workbench', icon: '🛠️', cost: { plank: 4, stone_block: 2, rope: 2 }, costText: '4 Planks, 2 Stone Blocks, 2 Ropes', labelKey: 'inv.workbench', descKey: 'recipe.workbench', station: 'none' },
      
      // Tier 2: Workbench Crafts
      { id: 'furnace', name: 'Smelting Furnace', icon: '🧱', cost: { stone: 12, wood: 6 }, costText: '12 Stone, 6 Wood', labelKey: 'inv.furnace', descKey: 'recipe.furnace', station: 'workbench' },
      { id: 'fishing_rod', name: 'Fishing Rod', icon: '🎣', cost: { stick: 2, rope: 2 }, costText: '2 Sticks, 2 Ropes', labelKey: 'inv.fishing_rod', descKey: 'recipe.fishing_rod', station: 'workbench' },
      { id: 'straw_hat', name: 'Straw Hat', icon: '👒', cost: { leaves: 6, rope: 2 }, costText: '6 Leaves, 2 Ropes', labelKey: 'inv.straw_hat', descKey: 'recipe.straw_hat', station: 'workbench' },
      { id: 'grass_pants', name: 'Grass Pants', icon: '👖', cost: { leaves: 8, rope: 3 }, costText: '8 Leaves, 3 Ropes', labelKey: 'inv.grass_pants', descKey: 'recipe.grass_pants', station: 'workbench' },
      { id: 'wooden_boots', name: 'Wooden Boots', icon: '🥾', cost: { wood: 4, rope: 2 }, costText: '4 Wood, 2 Ropes', labelKey: 'inv.wooden_boots', descKey: 'recipe.wooden_boots', station: 'workbench' },
      { id: 'torch', name: 'Hand Torch', icon: '🔦', cost: { stick: 1, leaves: 2 }, costText: '1 Stick, 2 Leaves', labelKey: 'inv.torch', descKey: 'recipe.torch', station: 'none' },
      { id: 'campfire', name: 'Campfire', icon: '🔥', cost: { wood: 4, stone: 2 }, costText: '4 Wood, 2 Stone', labelKey: 'inv.campfire', descKey: 'recipe.campfire', station: 'none' },
      
      // Refined Tools at Workbench
      { id: 'refined_spear', name: 'Refined Spear', icon: '⚔️', cost: { plank: 1, stone_block: 1, rope: 1 }, costText: '1 Plank, 1 Stone Block, 1 Rope', labelKey: 'inv.refined_spear', descKey: 'recipe.refined_spear', station: 'workbench' },
      { id: 'refined_axe', name: 'Refined Axe', icon: '🪓', cost: { plank: 2, stone_block: 2, rope: 1 }, costText: '2 Planks, 2 Stone Blocks, 1 Rope', labelKey: 'inv.refined_axe', descKey: 'recipe.refined_axe', station: 'workbench' },
      { id: 'refined_pickaxe', name: 'Refined Pickaxe', icon: '⛏️', cost: { plank: 2, stone_block: 2, rope: 1 }, costText: '2 Planks, 2 Stone Blocks, 1 Rope', labelKey: 'inv.refined_pickaxe', descKey: 'recipe.refined_pickaxe', station: 'workbench' },
      
      // Lab Table at Workbench
      { id: 'lab_table', name: 'Lab Table', icon: '🧪', cost: { copper_ingot: 4, glass: 2, wood: 10 }, costText: '4 Copper Ingots, 2 Glass, 10 Wood', labelKey: 'inv.lab_table', descKey: 'recipe.lab_table', station: 'workbench' },
      
      // Modular Building Blocks at Workbench
      { id: 'foundation', name: 'Wood Foundation', icon: '🪵', cost: { plank: 4, wood: 2 }, costText: '4 Planks, 2 Wood', labelKey: 'inv.foundation', descKey: 'recipe.foundation', station: 'workbench' },
      { id: 'wall', name: 'Wood Wall', icon: '🪵', cost: { plank: 3, stick: 4 }, costText: '3 Planks, 4 Sticks', labelKey: 'inv.wall', descKey: 'recipe.wall', station: 'workbench' },
      { id: 'primitive_roof', name: 'Leaf Roof', icon: '🍃', cost: { leaves: 4, rope: 2 }, costText: '4 Leaves, 2 Ropes', labelKey: 'inv.primitive_roof', descKey: 'recipe.primitive_roof', station: 'workbench' },
      { id: 'wood_roof', name: 'Wood Roof', icon: '🪵', cost: { plank: 3, wood: 2 }, costText: '3 Planks, 2 Wood', labelKey: 'inv.wood_roof', descKey: 'recipe.wood_roof', station: 'workbench' },
      { id: 'door', name: 'Wood Door', icon: '🚪', cost: { plank: 2, rope: 2 }, costText: '2 Planks, 2 Ropes', labelKey: 'inv.door', descKey: 'recipe.door', station: 'workbench' },
      
      // Exploration Map at Workbench
      { id: 'worn_map', name: 'Worn Map', icon: '🗺️', cost: { leaves: 4, charcoal: 1 }, costText: '4 Leaves, 1 Charcoal', labelKey: 'inv.worn_map', descKey: 'recipe.worn_map', station: 'workbench' },

      // Tier 3: Agriculture
      { id: 'planted_bush', name: 'Planted Berry Bush', icon: '🌱', cost: { berries: 3 }, costText: '3 Berries', labelKey: 'inv.planted_bush', descKey: 'recipe.planted_bush', station: 'none' },
      { id: 'planted_cane', name: 'Planted Bamboo Cane', icon: '🎋', cost: { cane: 2, rope: 1 }, costText: '2 Cane, 1 Rope', labelKey: 'inv.planted_cane', descKey: 'recipe.planted_cane', station: 'none' },

      // Tier 4: Lab Table Crafts
      { id: 'spectrometer', name: 'Spectrometer', icon: '🔬', cost: { copper_ingot: 2, glass: 1 }, costText: '2 Copper Ingots, 1 Glass', labelKey: 'inv.spectrometer', descKey: 'recipe.spectrometer', station: 'lab' },
      { id: 'chemical_analyzer', name: 'Chemical Analyzer', icon: '🧪', cost: { spectrometer: 1, rope: 2 }, costText: '1 Spectrometer, 2 Ropes', labelKey: 'inv.chemical_analyzer', descKey: 'recipe.chemical_analyzer', station: 'lab' },
      { id: 'heat_suit', name: 'Heat Suit', icon: '🦺', cost: { titanium_plate: 3, explorer_vest: 1 }, costText: '3 Titanium Plates, 1 Vest', labelKey: 'inv.heat_suit', descKey: 'recipe.heat_suit', station: 'lab' }
    ];

    const resourceIcons = {
      leaves: '🍃', rope: '🧵', wood: '🪵', stone: '🪨', stick: '🦯', cane: '🎋',
      sharp_stone: '🪨', plank: '🪵', stone_block: '🧱', raw_silicon: '🧪',
      raw_copper: '🥉', raw_titanium: '⚙️', copper_ingot: '🥉', titanium_plate: '⚙️',
      glass: '🥛', spectrometer: '🔬', explorer_vest: '🦺', charcoal: '🌑',
      foundation: '🪵', wall: '🪵', primitive_roof: '🍃', wood_roof: '🪵',
      door: '🚪', worn_map: '🗺️', berries: '🍓', planted_bush: '🌱', planted_cane: '🎋'
    };

    recipes.forEach(recipe => {
      let isAffordable = true;
      for (const res in recipe.cost) {
        if ((player.inventory[res] || 0) < recipe.cost[res]) {
          isAffordable = false;
        }
      }

      const itemEl = document.createElement('div');
      itemEl.className = 'crafting-item';
      
      const localizedName = getTranslation(recipe.labelKey) || recipe.name;
      
      // Build visual cost badges
      const costBadges = [];
      for (const res in recipe.cost) {
        const required = recipe.cost[res];
        const current = player.inventory[res] || 0;
        const icon = resourceIcons[res] || '';
        const isSatisfied = current >= required;
        costBadges.push(`
          <span class="cost-badge ${isSatisfied ? 'satisfied' : 'deficient'}">
            <span class="cost-badge-icon">${icon}</span>
            <span class="cost-badge-text">${current}/${required}</span>
          </span>
        `);
      }

      // Proximity & tool checks
      let isStationSatisfied = true;
      if (recipe.station && recipe.station !== 'none') {
        isStationSatisfied = isNearStation(recipe.station);
      }
      
      let isToolSatisfied = true;
      if (recipe.tool === 'axe' && getActiveAxe() === null) {
        isToolSatisfied = false;
      }
      if (recipe.tool === 'pickaxe' && getActivePickaxe() === null) {
        isToolSatisfied = false;
      }

      const canCraft = isAffordable && isStationSatisfied && isToolSatisfied;

      itemEl.innerHTML = `
        <div class="crafting-info">
          <div class="crafting-title-row">
            <span class="crafting-icon">${recipe.icon}</span>
            <span class="crafting-title">${localizedName}</span>
          </div>
          <div class="crafting-costs-container">${costBadges.join('')}</div>
        </div>
        <button class="craft-btn ${canCraft ? 'active' : ''}" ${canCraft ? '' : 'disabled'}>CRAFT</button>
      `;

      const btn = itemEl.querySelector('.craft-btn');
      btn.addEventListener('click', () => {
        if (!isStationSatisfied) {
          const name = getTranslation(`inv.${recipe.station}`) || recipe.station;
          showHudMessage(player.currentLang === 'it' ? `Serve la stazione: ${name.toUpperCase()} nelle vicinanze!` : `Needs workstation: ${name.toUpperCase()} nearby!`);
          return;
        }
        if (!isToolSatisfied) {
          showHudMessage(player.currentLang === 'it' ? `Devi possedere uno strumento (Accetta/Piccone) per lavorare la risorsa!` : `You need the required tool (Axe/Pickaxe) to process this resource!`);
          return;
        }

        if (isAffordable) {
          // Deduct
          for (const res in recipe.cost) {
            player.inventory[res] -= recipe.cost[res];
          }
          // Add
          player.inventory[recipe.id] = (player.inventory[recipe.id] || 0) + 1;
          
          playSelect(); // audio feedback

          // If placed structure, start placement immediately!
          const isStructure = recipe.id === 'campfire' || recipe.id === 'workbench' || recipe.id === 'furnace' || recipe.id === 'lab_table' ||
                              recipe.id === 'foundation' || recipe.id === 'wall' || recipe.id === 'primitive_roof' || recipe.id === 'wood_roof' || recipe.id === 'door';
          if (isStructure) {
            toggleInventory(); // close inventory
            import('./interact.js').then(module => {
              module.startStructurePlacement(recipe.id);
            });
            return;
          }

          // Sync & Render
          syncHotbarCounts();
          renderInventoryUI();
        }
      });

      craftingList.appendChild(itemEl);
    });
  }

  // 3. Render Clothing & Hand Slots
  const clothingSlots = {
    head: { id: 'straw_hat', name: 'Straw Hat', icon: '👒', labelKey: 'inv.straw_hat' },
    torso: { id: 'explorer_vest', name: 'Explorer Vest', icon: '🦺', labelKey: 'inv.explorer_vest' },
    legs: { id: 'grass_pants', name: 'Grass Pants', icon: '👖', labelKey: 'inv.grass_pants' },
    feet: { id: 'wooden_boots', name: 'Wooden Boots', icon: '🥾', labelKey: 'inv.wooden_boots' },
    right_hand: { id: 'stick', name: 'Stick', icon: '🦯', labelKey: 'inv.stick' },
    left_hand: { id: 'cane', name: 'Cane', icon: '🎋', labelKey: 'inv.cane' }
  };

  const slotSVGPlaceholders = {
    head: `<svg viewBox="0 0 24 24" class="slot-placeholder-svg"><path d="M 2 16 Q 12 10 22 16 Q 20 12 12 12 Q 4 12 2 16 Z M 6 12 Q 12 4 18 12" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    torso: `<svg viewBox="0 0 24 24" class="slot-placeholder-svg"><path d="M 6 4 L 9 4 L 10 6 L 14 6 L 15 4 L 18 4 L 20 8 L 17 9 L 17 20 L 7 20 L 7 9 L 4 8 Z" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    legs: `<svg viewBox="0 0 24 24" class="slot-placeholder-svg"><path d="M 7 4 L 17 4 L 19 20 L 13 20 L 12 10 L 11 10 L 5 20 L 7 4" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    feet: `<svg viewBox="0 0 24 24" class="slot-placeholder-svg"><path d="M 5 6 L 8 6 L 9 14 L 5 18 L 5 20 L 11 20 L 11 18 L 10 14 Z M 19 6 L 16 6 L 15 14 L 19 18 L 19 20 L 13 20 L 13 18 L 14 14 Z" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    right_hand: `<svg viewBox="0 0 24 24" class="slot-placeholder-svg"><path d="M18.5 5.5 L5.5 18.5 M4 20 L5.5 18.5 M15 3.5 L20.5 9 M7.5 13.5 L10.5 16.5" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    left_hand: `<svg viewBox="0 0 24 24" class="slot-placeholder-svg"><path d="M12 2 C16.5 2 20 3.5 20 7 C20 13.5 16.5 18.5 12 21 C7.5 18.5 4 13.5 4 7 C4 3.5 7.5 2 12 2 Z" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  };

  const allEquipableItems = {
    straw_hat: { name: 'Straw Hat', icon: '👒', labelKey: 'inv.straw_hat' },
    explorer_vest: { name: 'Explorer Vest', icon: '🦺', labelKey: 'inv.explorer_vest' },
    grass_pants: { name: 'Grass Pants', icon: '👖', labelKey: 'inv.grass_pants' },
    wooden_boots: { name: 'Wooden Boots', icon: '🥾', labelKey: 'inv.wooden_boots' },
    stick: { name: 'Stick', icon: '🦯', labelKey: 'inv.stick' },
    fishing_rod: { name: 'Fishing Rod', icon: '🎣', labelKey: 'inv.fishing_rod' },
    cane: { name: 'Cane', icon: '🎋', labelKey: 'inv.cane' },
    torch: { name: 'Hand Torch', icon: '🔦', labelKey: 'inv.torch' }
  };

  for (const slotType in clothingSlots) {
    const el = document.querySelector(`.clothing-slot[data-slot="${slotType}"]`);
    if (el) {
      const equippedId = player.equipped[slotType];
      if (equippedId) {
        const itemInfo = allEquipableItems[equippedId] || clothingSlots[slotType];
        el.classList.remove('empty');
        el.innerHTML = `
          <span class="clothing-slot-type">${getTranslation(`inv_slot_${slotType}`) || slotType.toUpperCase()}</span>
          <div class="clothing-slot-content">
            <span class="slot-icon">${itemInfo.icon}</span>
            <span class="slot-text">${getTranslation(itemInfo.labelKey) || itemInfo.name}</span>
          </div>
        `;
      } else {
        el.classList.add('empty');
        el.innerHTML = `
          <span class="clothing-slot-type">${getTranslation(`inv_slot_${slotType}`) || slotType.toUpperCase()}</span>
          <div class="clothing-slot-content">
            <span class="slot-icon-container">${slotSVGPlaceholders[slotType]}</span>
            <span class="slot-text">${getTranslation('inv.empty') || '[Empty]'}</span>
          </div>
        `;
      }
    }
  }

  // 4. Update Stats Modifiers Labels
  const hasHat = player.equipped.head === 'straw_hat';
  const hasVest = player.equipped.torso === 'explorer_vest' || player.equipped.torso === 'heat_suit';
  const hasBoots = player.equipped.feet === 'wooden_boots';

  document.getElementById('stat-mod-energy').innerText = hasVest ? '80%' : '100%';
  document.getElementById('stat-mod-hydration').innerText = hasHat ? '75%' : '100%';
  document.getElementById('stat-mod-speed').innerText = hasBoots ? '+15%' : '+0%';
}

// Update HUD stats, compass and escape target distance
export function updateHUD(depth, temp) {
  // Sync bar fills
  const healthFill = getDom('health-fill');
  const energyFill = getDom('energy-fill');
  const hydrationFill = getDom('hydration-fill');
  if (healthFill) healthFill.style.width = `${player.health}%`;
  if (energyFill) energyFill.style.width = `${player.energy}%`;
  if (hydrationFill) hydrationFill.style.width = `${player.hydration}%`;

  // Sync bar text values
  const healthVal = getDom('health-value');
  const energyVal = getDom('energy-value');
  const hydrationVal = getDom('hydration-value');
  if (healthVal) healthVal.innerText = `${Math.ceil(player.health)}%`;
  if (energyVal) energyVal.innerText = `${Math.ceil(player.energy)}%`;
  if (hydrationVal) hydrationVal.innerText = `${Math.ceil(player.hydration)}%`;

  // Update Telemetry indicators
  const altitudeVal = getDom('hud-altitude-val');
  const playerPos = game.controls && game.controls.getObject ? game.controls.getObject().position : null;
  if (altitudeVal && playerPos) {
    const altitude = playerPos.y - 4.0;
    altitudeVal.innerText = altitude >= 0 ? `+${altitude.toFixed(1)} m` : `${altitude.toFixed(1)} m`;
  }
  const depthVal = getDom('hud-depth-val');
  if (depthVal) depthVal.innerText = `-${depth} m`;
  const dateVal = getDom('hud-date-val');
  const seasonVal = getDom('hud-season-val');
  const cal = getCalendarState();
  if (dateVal) dateVal.innerText = `${cal.day} ${cal.monthName}`;
  if (seasonVal) seasonVal.innerText = cal.seasonName;
  const tempVal = getDom('hud-temp-val');
  if (tempVal && playerPos) {
    const isSheltered = checkIsSheltered(playerPos);
    const shelterSuffix = isSheltered ? (player.currentLang === 'it' ? " (AL RIPARO)" : " (SHELTERED)") : "";
    tempVal.innerText = `${temp} °C${shelterSuffix}`;
  }

  // Update Dynamic Compass
  if (game.controls && game.controls.getObject && game.camera) {
    const cameraObj = game.camera;
    cameraObj.getWorldDirection(directionVec);
    const angle = Math.atan2(directionVec.x, directionVec.z);
    
    const tape = getDom('compass-tape');
    if (tape) {
      const oneCycleWidth = tape.offsetWidth / 3;
      let diff = angle - Math.PI;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      
      const offset = (diff / (Math.PI * 2)) * oneCycleWidth;
      tape.style.transform = `translateX(calc(-50% + ${offset}px))`;
    }
  }

  // Update Distance to target
  if (game.controls && game.controls.getObject && playerPos) {
    const rawDist = playerPos.distanceTo(targetLoc);
    const scaleDist = Math.round(rawDist * 10 + 400); // offset so it starts around 1810m
    const distVal = getDom('distance-value');
    if (distVal) distVal.innerText = `${scaleDist} m`;
  }
}

// Check shelter bounding boxes (duplicated from player.js to avoid circular import issues)
function checkIsSheltered(pos) {
  if (!world.placedStructures) return false;
  
  // A shelter is defined by having a primitive_roof or wood_roof structure directly above the player's position
  // within a bounding box of 3.5x3.5m horizontally, and up to 6.5m vertically above player coordinates
  for (let i = 0; i < world.placedStructures.length; i++) {
    const struct = world.placedStructures[i];
    if (struct.userData && (struct.userData.type === 'primitive_roof' || struct.userData.type === 'wood_roof')) {
      const dx = Math.abs(pos.x - struct.position.x);
      const dz = Math.abs(pos.z - struct.position.z);
      const dy = struct.position.y - pos.y;
      
      if (dx < 3.0 && dz < 3.0 && dy > 0.0 && dy < 6.0) {
        return true;
      }
    }
  }
  return false;
}

function downloadManualAsPDF() {
  const langCode = localStorage.getItem('game_language') || 'en';
  const title = getTranslation('guide_title');
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap');
        body {
          font-family: 'Outfit', sans-serif;
          color: #1e293b;
          line-height: 1.6;
          max-width: 800px;
          margin: 40px auto;
          padding: 20px;
          background: #ffffff;
        }
        h1 {
          font-size: 2.5rem;
          font-weight: 800;
          color: #8b5cf6;
          margin-bottom: 5px;
          border-bottom: 2px solid #8b5cf6;
          padding-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .subtitle {
          font-size: 1.1rem;
          font-weight: 600;
          color: #64748b;
          margin-bottom: 30px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        h2 {
          font-size: 1.5rem;
          color: #0f172a;
          margin-top: 30px;
          margin-bottom: 15px;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 5px;
        }
        p {
          font-size: 1rem;
          color: #334155;
          margin-bottom: 15px;
        }
        ul {
          padding-left: 20px;
          margin-bottom: 20px;
        }
        li {
          margin-bottom: 10px;
          font-size: 0.95rem;
        }
        strong {
          color: #8b5cf6;
        }
        .tip-box {
          background: #f5f3ff;
          border-left: 4px solid #8b5cf6;
          padding: 15px;
          border-radius: 6px;
          margin-top: 15px;
          margin-bottom: 25px;
        }
        .tip-box strong {
          color: #6d28d9;
          display: block;
          margin-bottom: 4px;
        }
        @media print {
          body {
            margin: 0;
            padding: 0;
          }
        }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <div class="subtitle">Beta Vertical Slice v0.107 — Official Gameplay & Controls Reference (${langCode.toUpperCase()})</div>

      <h2>1. ${getTranslation('tab_survival')}</h2>
      <p>${getTranslation('guide_p_survival')}</p>
      <ul>
        <li><strong>${getTranslation('guide_lbl_health')}</strong> ${getTranslation('guide_desc_health')}</li>
        <li><strong>${getTranslation('guide_lbl_energy')}</strong> ${getTranslation('guide_desc_energy')}</li>
        <li><strong>${getTranslation('guide_lbl_hydration')}</strong> ${getTranslation('guide_desc_hydration')}</li>
        <li><strong>${getTranslation('guide_lbl_fishing')}</strong> ${getTranslation('guide_desc_fishing')}</li>
      </ul>
      <div class="tip-box">
        <strong>${getTranslation('guide_tip_title')}</strong>
        ${getTranslation('guide_tip_survival')}
      </div>

      <h2>2. ${getTranslation('tab_movement')}</h2>
      <p>${getTranslation('guide_p_movement')}</p>
      <ul>
        <li><strong>${getTranslation('guide_lbl_keys')}</strong> ${getTranslation('guide_desc_keys')}</li>
        <li><strong>${getTranslation('guide_lbl_sprint')}</strong> ${getTranslation('guide_desc_sprint')}</li>
        <li><strong>${getTranslation('guide_lbl_swimming')}</strong> ${getTranslation('guide_desc_swimming')}</li>
        <li><strong>${getTranslation('guide_lbl_raft')}</strong> ${getTranslation('guide_desc_raft')}</li>
      </ul>

      <h2>3. ${getTranslation('tab_mining')}</h2>
      <p>${getTranslation('guide_p_mining')}</p>
      <ul>
        <li><strong>${getTranslation('guide_lbl_digging')}</strong> ${getTranslation('guide_desc_digging')}</li>
        <li><strong>${getTranslation('guide_lbl_sculpting')}</strong> ${getTranslation('guide_desc_sculpting')}</li>
        <li><strong>${getTranslation('guide_lbl_gold')}</strong> ${getTranslation('guide_desc_gold')}</li>
        <li><strong>${getTranslation('guide_lbl_smelting')}</strong> ${getTranslation('guide_desc_smelting')}</li>
      </ul>
      <div class="tip-box">
        <strong>${getTranslation('guide_tip_title') || "SURVIVAL TIP:"}</strong>
        ${getTranslation('guide_tip_mining')}
      </div>

      <h2>4. ${getTranslation('tab_crafting')}</h2>
      <p>${getTranslation('guide_p_crafting')}</p>
      <ul>
        <li><strong>${getTranslation('guide_lbl_inventory')}</strong> ${getTranslation('guide_desc_inventory')}</li>
        <li><strong>${getTranslation('guide_lbl_recipes')}</strong> ${getTranslation('guide_desc_recipes')}</li>
        <li><strong>${getTranslation('guide_lbl_building')}</strong> ${getTranslation('guide_desc_building')}</li>
        <li><strong>${getTranslation('guide_lbl_farming')}</strong> ${getTranslation('guide_desc_farming')}</li>
        <li><strong>${getTranslation('guide_lbl_canes')}</strong> ${getTranslation('guide_desc_canes')}</li>
      </ul>

      <h2>5. ${getTranslation('tab_weather')}</h2>
      <p>${getTranslation('guide_p_weather')}</p>
      <ul>
        <li><strong>${getTranslation('guide_lbl_weather')}</strong> ${getTranslation('guide_desc_weather')}</li>
        <li><strong>${getTranslation('guide_lbl_seasons')}</strong> ${getTranslation('guide_desc_seasons')}</li>
        <li><strong>${getTranslation('guide_lbl_hunting')}</strong> ${getTranslation('guide_desc_hunting')}</li>
      </ul>
    </body>
    </html>
  `;
  
  printWindow.document.write(html);
  printWindow.document.close();
  
  printWindow.onload = function() {
    printWindow.print();
  };
}

// Performance Settings bindings (moved from game.js)
export function bindPerfProtocolsUI() {
  const hoverables = document.querySelectorAll('.lang-pill, .preset-btn, #mute-toggle, #toggle-shadows-btn, #toggle-sway-btn, .guide-tab-btn, .guide-btn-action, .guide-btn-close');
  hoverables.forEach(el => {
    el.addEventListener('mouseenter', () => {
      playHover();
    });
  });

  const shadowsBtn = document.getElementById('toggle-shadows-btn');
  if (shadowsBtn) {
    shadowsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      game.shadowsEnabled = !game.shadowsEnabled;
      
      if (game.shadowsEnabled) {
        shadowsBtn.classList.add('active');
        shadowsBtn.querySelector('.preset-name').textContent = 'SHADOWS: ON';
      } else {
        shadowsBtn.classList.remove('active');
        shadowsBtn.querySelector('.preset-name').textContent = 'SHADOWS: OFF';
      }
      
      if (game.renderer) {
        game.renderer.shadowMap.enabled = game.shadowsEnabled;
        if (game.shadowsEnabled) {
          game.renderer.shadowMap.needsUpdate = true;
        }
      }
      if (game.lights && game.lights.sun) {
        game.lights.sun.castShadow = game.shadowsEnabled;
      }
      
      if (game.scene) {
        game.scene.traverse(node => {
          if (node.isMesh) {
            node.castShadow = game.shadowsEnabled;
            node.receiveShadow = game.shadowsEnabled;
            if (node.material) {
              node.material.needsUpdate = true;
            }
          }
        });
      }
      playSelect();
    });
  }

  const swayBtn = document.getElementById('toggle-sway-btn');
  if (swayBtn) {
    swayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      game.windSwayEnabled = !game.windSwayEnabled;
      
      if (game.windSwayEnabled) {
        swayBtn.classList.add('active');
        swayBtn.querySelector('.preset-name').textContent = 'WIND SWAY: ON';
      } else {
        swayBtn.classList.remove('active');
        swayBtn.querySelector('.preset-name').textContent = 'WIND SWAY: OFF';
      }
      playSelect();
    });
  }

  const scaleSelect = document.getElementById('render-scale-select');
  if (scaleSelect) {
    scaleSelect.addEventListener('change', (e) => {
      const scale = parseFloat(e.target.value);
      game.renderScale = scale;
      
      if (game.renderer) {
        game.renderer.setPixelRatio(scale * Math.min(window.devicePixelRatio, 2));
        game.renderer.setSize(window.innerWidth, window.innerHeight);
      }
      playSelect();
    });
  }

  // Game Guide Modal bindings
  const guideBtn = document.getElementById('guide-button');
  const guideModal = document.getElementById('guide-modal');
  const guideCloseBtn = document.getElementById('guide-close-btn');
  const guideTabBtns = document.querySelectorAll('.guide-tab-btn');
  const guideSections = document.querySelectorAll('.guide-section');
  const guideDownloadPdfBtn = document.getElementById('guide-download-pdf-btn');

  if (guideBtn && guideModal) {
    guideBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playSelect();
      guideModal.style.display = 'flex';
    });
  }

  if (guideCloseBtn && guideModal) {
    guideCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playSelect();
      guideModal.style.display = 'none';
    });
  }

  guideTabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      playSelect();
      
      // Toggle active tab class
      guideTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Show corresponding section
      const tabName = btn.getAttribute('data-tab');
      guideSections.forEach(sect => {
        if (sect.id === `sect-${tabName}`) {
          sect.classList.add('active');
        } else {
          sect.classList.remove('active');
        }
      });
    });
  });

  if (guideDownloadPdfBtn) {
    guideDownloadPdfBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playSelect();
      downloadManualAsPDF();
    });
  }
}

// Scrolling telemetry log lines
const logLines = [
  "SYS_STATUS: ACTIVE",
  "GRID_DENSITY: 40x16x40",
  "CORE_TEMP: NOMINAL",
  "SATELLITE_LINK: STABLE",
  "ORBITAL_VELOCITY: 7.2 KM/S",
  "VOXEL_MESH: GENERATED",
  "LIGHTHOUSE: BEACON_SYNCED",
  "GPS_COORDS: RETRIEVED",
  "WIND_SPEED: 12 KNOTS",
  "WAVE_FREQ: 0.35 HZ",
  "DEBRIS_FIELD: INTEGRATED",
  "BIOMETRIC_STATUS: GOOD",
  "HOLOGRAPHIC_HUD: ARMED",
  "WATER_DEPTH: 5.2 METERS",
  "BAROMETRIC_PRESSURE: 1013 HPA",
  "GRAVITY_FORCE: 9.8 M/S^2"
];

let activeLogs = [];

export function initTerminalLogger() {
  const term = document.getElementById('telemetry-terminal');
  if (!term) return;

  const bootLines = [
    "SYS_STATUS: ACTIVE",
    "SCANNING ISLAND TOPOGRAPHY... DONE",
    "GOLD ORE VEINS LOCATED: OK",
    "CARIBBEAN SHORELINE GENERATED",
    "SATELLITE INTERACTION: ONLINE"
  ];

  let lineIdx = 0;
  let charIdx = 0;
  let currentHTML = "";

  function typeNextChar() {
    if (lineIdx < bootLines.length) {
      const line = bootLines[lineIdx];
      if (charIdx === 0) {
        if (currentHTML) currentHTML += "<br>";
        currentHTML += "> ";
      }
      currentHTML += line[charIdx];
      term.innerHTML = currentHTML + '<span class="terminal-cursor">_</span>';
      charIdx++;

      if (charIdx >= line.length) {
        activeLogs.push("> " + line);
        if (activeLogs.length > 4) {
          activeLogs.shift();
          currentHTML = activeLogs.join("<br>");
        }
        lineIdx++;
        charIdx = 0;
        setTimeout(typeNextChar, 350);
      } else {
        setTimeout(typeNextChar, 18);
      }
    } else {
      startAmbientLogging();
    }
  }

  function startAmbientLogging() {
    setInterval(() => {
      const newLine = logLines[Math.floor(Math.random() * logLines.length)];
      activeLogs.push("> " + newLine);
      if (activeLogs.length > 4) {
        activeLogs.shift();
      }
      term.innerHTML = activeLogs.join('<br>') + '<span class="terminal-cursor">_</span>';
    }, 1600);
  }

  typeNextChar();
}
