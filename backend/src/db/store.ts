/**
 * In-memory store with a simple file-persistence layer.
 * Swap this interface for DynamoDB/Postgres adapters without changing business logic.
 */
import fs from 'fs';
import path from 'path';
import { User, Team, RetroBoard, Card, ActionItem } from '../types';

interface DbState {
  users: Record<string, User>;
  teams: Record<string, Team>;
  boards: Record<string, RetroBoard>;
  cards: Record<string, Card>;
  actionItems: Record<string, ActionItem>;
}

const DATA_FILE = path.join(__dirname, '../../data/db.json');

function loadState(): DbState {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {
    // fall through to default
  }
  return { users: {}, teams: {}, boards: {}, cards: {}, actionItems: {} };
}

function saveState(state: DbState): void {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('[store] Failed to persist state to disk:', err);
  }
}

class Store {
  private state: DbState;

  constructor() {
    this.state = loadState();
  }

  private persist() {
    saveState(this.state);
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  getUser(id: string): User | undefined {
    return this.state.users[id];
  }

  getUserByEmail(email: string): User | undefined {
    return Object.values(this.state.users).find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );
  }

  saveUser(user: User): User {
    this.state.users[user.id] = user;
    this.persist();
    return user;
  }

  // ── Teams ──────────────────────────────────────────────────────────────────

  getTeam(id: string): Team | undefined {
    return this.state.teams[id];
  }

  getTeamByInviteCode(code: string): Team | undefined {
    return Object.values(this.state.teams).find((t) => t.inviteCode === code);
  }

  getTeamsForUser(userId: string): Team[] {
    return Object.values(this.state.teams).filter((t) =>
      t.members.some((m) => m.userId === userId)
    );
  }

  saveTeam(team: Team): Team {
    this.state.teams[team.id] = team;
    this.persist();
    return team;
  }

  // ── Boards ─────────────────────────────────────────────────────────────────

  getBoard(id: string): RetroBoard | undefined {
    return this.state.boards[id];
  }

  getBoardsForTeam(teamId: string): RetroBoard[] {
    return Object.values(this.state.boards)
      .filter((b) => b.teamId === teamId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  saveBoard(board: RetroBoard): RetroBoard {
    this.state.boards[board.id] = board;
    this.persist();
    return board;
  }

  // ── Cards ──────────────────────────────────────────────────────────────────

  getCard(id: string): Card | undefined {
    return this.state.cards[id];
  }

  getCardsForBoard(boardId: string): Card[] {
    return Object.values(this.state.cards)
      .filter((c) => c.boardId === boardId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  saveCard(card: Card): Card {
    this.state.cards[card.id] = card;
    this.persist();
    return card;
  }

  deleteCard(id: string): void {
    delete this.state.cards[id];
    this.persist();
  }

  // ── Action Items ───────────────────────────────────────────────────────────

  getActionItem(id: string): ActionItem | undefined {
    return this.state.actionItems[id];
  }

  getActionItemsForBoard(boardId: string): ActionItem[] {
    return Object.values(this.state.actionItems)
      .filter((a) => a.boardId === boardId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  saveActionItem(item: ActionItem): ActionItem {
    this.state.actionItems[item.id] = item;
    this.persist();
    return item;
  }

  deleteActionItem(id: string): void {
    delete this.state.actionItems[id];
    this.persist();
  }
}

export const db = new Store();
