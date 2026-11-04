import { store } from '../state/store';

export interface ChainItem {
  clipId: string;
  repeat: number;
}

export interface TransitionWarning {
  fromClip: string;
  toClip: string;
  message: string;
}

export class BlendTester {
  readonly element: HTMLElement;
  private chain: ChainItem[] = [];
  private isVisible = false;

  constructor(
    parent: HTMLElement,
    private readonly onPlayChain?: (chain: ChainItem[]) => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'blend-tester-drawer hidden';

    const header = document.createElement('div');
    header.className = 'blend-header';
    header.innerHTML = `
      <div class="blend-title">🔗 BLEND TESTER & CHAIN PREVIEW</div>
      <button class="btn-close">✕</button>
    `;
    header.querySelector('.btn-close')!.addEventListener('click', () => this.toggle(false));
    this.element.appendChild(header);

    const body = document.createElement('div');
    body.className = 'blend-body';
    this.element.appendChild(body);

    parent.appendChild(this.element);

    store.subscribe(() => {
      if (this.isVisible) this.render(body);
    });
  }

  toggle(visible?: boolean): void {
    this.isVisible = visible !== undefined ? visible : !this.isVisible;
    if (this.isVisible) {
      this.element.classList.remove('hidden');
      const body = this.element.querySelector('.blend-body') as HTMLElement;
      this.render(body);
    } else {
      this.element.classList.add('hidden');
    }
  }

  addToChain(clipId: string): void {
    this.chain.push({ clipId, repeat: 1 });
    const body = this.element.querySelector('.blend-body') as HTMLElement;
    this.render(body);
  }

  private render(container: HTMLElement): void {
    container.innerHTML = '';
    const state = store.getState();
    const clips = state.project.clips;

    // --- LEFT COLUMN: Chain Builder ---
    const leftCol = document.createElement('div');
    leftCol.className = 'blend-col chain-col';
    leftCol.innerHTML = '<div class="col-title">ANIMATION CHAIN</div>';

    const chainList = document.createElement('div');
    chainList.className = 'chain-list';

    if (this.chain.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-notice';
      empty.textContent = 'Add clips from the right to build a motion transition chain.';
      chainList.appendChild(empty);
    } else {
      this.chain.forEach((item, idx) => {
        const clip = clips.find((c) => c.id === item.clipId);
        const row = document.createElement('div');
        row.className = 'chain-item';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'chain-clip-name';
        nameSpan.textContent = `${idx + 1}. ${clip ? clip.name : item.clipId}`;

        // Repeat selector
        const repSpan = document.createElement('span');
        repSpan.className = 'chain-repeat';
        repSpan.textContent = `×${item.repeat}`;
        repSpan.title = 'Click to increase loop repetitions';
        repSpan.onclick = () => {
          item.repeat = (item.repeat % 3) + 1;
          this.render(container);
        };

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-chain-remove';
        removeBtn.textContent = '✕';
        removeBtn.onclick = () => {
          this.chain.splice(idx, 1);
          this.render(container);
        };

        row.append(nameSpan, repSpan, removeBtn);
        chainList.appendChild(row);

        // Check transition foot matching
        if (idx < this.chain.length - 1) {
          const nextItem = this.chain[idx + 1];
          const nextClip = clips.find((c) => c.id === nextItem.clipId);
          if (clip && nextClip && nextClip.entryFoot) {
            // Find planted foot at exit
            const exitTime = clip.exit ?? (clip.out - clip.in);
            const plantedAtExit = clip.planted.find((p) => exitTime >= p.from && exitTime <= p.to);

            const warnDiv = document.createElement('div');
            warnDiv.className = 'transition-badge';

            if (!plantedAtExit) {
              warnDiv.className += ' warn';
              warnDiv.textContent = `⚠ Foot mismatch: ${nextClip.name} requires ${nextClip.entryFoot} planted, but no planted foot at exit (${exitTime.toFixed(2)}s)`;
            } else if (plantedAtExit.foot !== nextClip.entryFoot) {
              warnDiv.className += ' warn';
              warnDiv.textContent = `⚠ Foot mismatch: Next needs ${nextClip.entryFoot}, but ${plantedAtExit.foot} is planted`;
            } else {
              warnDiv.className += ' match';
              warnDiv.textContent = `✓ Perfect foot match (${nextClip.entryFoot}) for 0.15s blend`;
            }
            chainList.appendChild(warnDiv);
          }
        }
      });
    }

    leftCol.appendChild(chainList);

    // Chain Actions
    const chainActions = document.createElement('div');
    chainActions.className = 'chain-actions';

    const playBtn = document.createElement('button');
    playBtn.className = 'btn btn-primary';
    playBtn.textContent = '▶ Play Chain Transition';
    playBtn.disabled = this.chain.length === 0;
    playBtn.onclick = () => this.onPlayChain?.(this.chain);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-secondary';
    clearBtn.textContent = 'Clear Chain';
    clearBtn.onclick = () => {
      this.chain = [];
      this.render(container);
    };

    chainActions.append(playBtn, clearBtn);
    leftCol.appendChild(chainActions);

    // --- RIGHT COLUMN: Clip Picker & Next-Best Ranking ---
    const rightCol = document.createElement('div');
    rightCol.className = 'blend-col candidates-col';
    rightCol.innerHTML = '<div class="col-title">AVAILABLE CLIPS & NEXT-BEST MATCHES</div>';

    const candidatesList = document.createElement('div');
    candidatesList.className = 'candidates-list';

    const selected = store.getSelectedClip();

    clips.forEach((c) => {
      const card = document.createElement('div');
      card.className = 'candidate-card';

      // Score rank relative to selected clip
      let matchScore = 80;
      if (selected && selected.exit && c.entryFoot) {
        const exitTime = selected.exit;
        const planted = selected.planted.find((p) => exitTime >= p.from && exitTime <= p.to);
        if (planted && planted.foot === c.entryFoot) {
          matchScore += 18;
        } else if (planted && planted.foot !== c.entryFoot) {
          matchScore -= 30;
        }
      }

      card.innerHTML = `
        <div class="candidate-header">
          <span class="candidate-name">${c.name}</span>
          <span class="score-pill score-${matchScore >= 90 ? 'high' : matchScore >= 70 ? 'med' : 'low'}">${matchScore}% match</span>
        </div>
        <div class="candidate-meta">
          Entry: ${c.entryFoot ? `Foot ${c.entryFoot}` : 'Any'} · ${(c.out - c.in).toFixed(2)}s · ${c.tags.join(', ')}
        </div>
      `;

      card.onclick = () => this.addToChain(c.id);
      candidatesList.appendChild(card);
    });

    rightCol.appendChild(candidatesList);

    container.append(leftCol, rightCol);
  }
}
