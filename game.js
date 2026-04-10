class Game {
  constructor() {
    this.nextId = 0;
    this.tiles = []; // { id, value, row, col, el, targetRow?, targetCol? }
    this.animating = false;
    this._buildGrid();
    this._bindEvents();
    this.reset();
  }

  // ── Setup ──────────────────────────────────────────────────────────

  reset() {
    this.score = 0;
    this.gameOver = false;
    this.won = false;
    this.continued = false;
    this.animating = false;
    this.tiles.forEach(t => t.el && t.el.remove());
    this.tiles = [];
    this.board = Array.from({ length: 4 }, () => Array(4).fill(0));
    this.addRandomTile();
    this.addRandomTile();
    this._renderStatic();
  }

  _buildGrid() {
    const container = document.getElementById('grid-container');
    container.innerHTML = '';
    for (let i = 0; i < 16; i++) {
      const bg = document.createElement('div');
      bg.className = 'cell-bg';
      container.appendChild(bg);
    }
    const tileLayer = document.createElement('div');
    tileLayer.id = 'tile-layer';
    container.appendChild(tileLayer);
  }

  _bindEvents() {
    document.addEventListener('keydown', (e) => {
      if (this.animating || this.gameOver || (this.won && !this.continued)) return;
      const dirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      const dir = dirs[e.key];
      if (!dir) return;
      e.preventDefault();
      this._handleMove(dir);
    });

    document.getElementById('new-game').addEventListener('click', () => this.reset());
    document.getElementById('restart').addEventListener('click', () => this.reset());
    document.getElementById('continue').addEventListener('click', () => {
      this.continued = true;
      this._renderStatic();
    });

    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.body.setAttribute('data-theme', btn.dataset.theme);
      });
    });

    // Swipe support for mobile
    let touchStartX = 0;
    let touchStartY = 0;
    document.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      e.preventDefault(); // block page scroll while swiping
    }, { passive: false });
    document.addEventListener('touchend', (e) => {
      if (this.animating || this.gameOver || (this.won && !this.continued)) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return; // too short, ignore
      if (Math.abs(dx) > Math.abs(dy)) {
        this._handleMove(dx > 0 ? 'right' : 'left');
      } else {
        this._handleMove(dy > 0 ? 'down' : 'up');
      }
    }, { passive: true });
  }

  // ── Tile spawning ──────────────────────────────────────────────────

  addRandomTile() {
    const empty = [];
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++)
        if (this.board[r][c] === 0) empty.push([r, c]);
    if (!empty.length) return;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    this.board[r][c] = value;
    const tile = { id: this.nextId++, value, row: r, col: c, el: null };
    tile.el = this._createTileEl(tile);
    this.tiles.push(tile);
  }

  _createTileEl(tile) {
    const el = document.createElement('div');
    el.className = 'tile tile-new';
    el.setAttribute('data-value', String(tile.value));
    el.textContent = String(tile.value);
    const { left, top } = this._tilePos(tile.row, tile.col);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    document.getElementById('tile-layer').appendChild(el);
    return el;
  }

  // Returns pixel position for a given board cell
  _tilePos(row, col) {
    return { left: 10 + col * 100, top: 10 + row * 100 };
  }

  // ── Move handling ──────────────────────────────────────────────────

  async _handleMove(direction) {
    const { moved, toRemove, toUpdate } = this._computeMove(direction);
    if (!moved) return;

    this.animating = true;
    await this._animate(toRemove, toUpdate);
    this.addRandomTile();
    this.checkWin();
    this.checkGameOver();
    this._renderStatic();
    this.animating = false;
  }

  _computeMove(direction) {
    let moved = false;
    const toRemove = [];
    const toUpdate = [];

    const getTile = (r, c) => this.tiles.find(t => t.row === r && t.col === c) || null;

    const processLine = (indices) => {
      // Collect non-empty tiles in line order
      const line = indices.map(([r, c]) => getTile(r, c)).filter(Boolean);

      // Clear board cells for this line
      indices.forEach(([r, c]) => { this.board[r][c] = 0; });

      let writePos = 0;
      let i = 0;
      while (i < line.length) {
        const [destR, destC] = indices[writePos];

        if (i + 1 < line.length && line[i].value === line[i + 1].value) {
          // Merge pair
          const newValue = line[i].value * 2;
          this.score += newValue;

          line[i].targetRow = destR;
          line[i].targetCol = destC;
          toUpdate.push({ tile: line[i], newValue });

          // Consumed tile slides to same destination, then disappears
          line[i + 1].targetRow = destR;
          line[i + 1].targetCol = destC;
          toRemove.push(line[i + 1]);

          this.board[destR][destC] = newValue;
          if (line[i].row !== destR || line[i].col !== destC) moved = true;
          if (line[i + 1].row !== destR || line[i + 1].col !== destC) moved = true;
          i += 2;
        } else {
          line[i].targetRow = destR;
          line[i].targetCol = destC;
          if (line[i].row !== destR || line[i].col !== destC) moved = true;
          this.board[destR][destC] = line[i].value;
          i++;
        }
        writePos++;
      }
    };

    if (direction === 'left')       for (let r = 0; r < 4; r++) processLine([[r,0],[r,1],[r,2],[r,3]]);
    else if (direction === 'right') for (let r = 0; r < 4; r++) processLine([[r,3],[r,2],[r,1],[r,0]]);
    else if (direction === 'up')    for (let c = 0; c < 4; c++) processLine([[0,c],[1,c],[2,c],[3,c]]);
    else if (direction === 'down')  for (let c = 0; c < 4; c++) processLine([[3,c],[2,c],[1,c],[0,c]]);

    return { moved, toRemove, toUpdate };
  }

  async _animate(toRemove, toUpdate) {
    const DURATION = 100; // ms

    // Slide all tiles to their target positions
    this.tiles.forEach(tile => {
      if (tile.targetRow === undefined) return;
      const { left, top } = this._tilePos(tile.targetRow, tile.targetCol);
      tile.el.style.transition = `left ${DURATION}ms ease, top ${DURATION}ms ease`;
      tile.el.style.left = left + 'px';
      tile.el.style.top = top + 'px';
    });

    await new Promise(resolve => setTimeout(resolve, DURATION));

    // Remove consumed (merged-into) tiles
    toRemove.forEach(tile => {
      tile.el.remove();
      this.tiles = this.tiles.filter(t => t.id !== tile.id);
    });

    // Update merged tile values and play pop animation
    toUpdate.forEach(({ tile, newValue }) => {
      tile.value = newValue;
      tile.el.setAttribute('data-value', String(newValue));
      tile.el.textContent = String(newValue);
      tile.el.classList.remove('tile-merge');
      void tile.el.offsetWidth; // force reflow to restart animation
      tile.el.classList.add('tile-merge');
    });

    // Commit positions and clear transitions
    this.tiles.forEach(tile => {
      if (tile.targetRow === undefined) return;
      tile.row = tile.targetRow;
      tile.col = tile.targetCol;
      tile.el.style.transition = '';
      delete tile.targetRow;
      delete tile.targetCol;
    });
  }

  // ── Win / Game over ────────────────────────────────────────────────

  checkWin() {
    if (this.won) return;
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++)
        if (this.board[r][c] === 2048) { this.won = true; return; }
  }

  checkGameOver() {
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++)
        if (this.board[r][c] === 0) return;
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) {
        const v = this.board[r][c];
        if (c + 1 < 4 && this.board[r][c + 1] === v) return;
        if (r + 1 < 4 && this.board[r + 1][c] === v) return;
      }
    this.gameOver = true;
  }

  // ── Rendering ─────────────────────────────────────────────────────

  _renderStatic() {
    document.getElementById('score').textContent = this.score;

    const overlay = document.getElementById('overlay');
    const message = document.getElementById('overlay-message');
    const continueBtn = document.getElementById('continue');

    if (this.won && !this.continued) {
      message.textContent = 'You Win!';
      continueBtn.style.display = '';
      overlay.classList.remove('hidden');
    } else if (this.gameOver) {
      message.textContent = 'Game Over';
      continueBtn.style.display = 'none';
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }
  }
}

const game = new Game();
