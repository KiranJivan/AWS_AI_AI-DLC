export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

export interface TeamMember {
  userId: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

export interface Team {
  id: string;
  name: string;
  inviteCode: string;
  members: TeamMember[];
  createdAt: string;
}

export type CardCategory = 'went_well' | 'to_improve' | 'action_item';

export interface Card {
  id: string;
  boardId: string;
  category: CardCategory;
  text: string;
  authorId: string | null; // null = anonymous
  votes: string[]; // array of userIds
  createdAt: string;
}

export interface ActionItem {
  id: string;
  boardId: string;
  text: string;
  ownerId: string | null;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export type BoardStatus = 'open' | 'voting' | 'closed';

export interface RetroBoard {
  id: string;
  teamId: string;
  title: string;
  status: BoardStatus;
  anonymousSubmissions: boolean;
  createdBy: string;
  createdAt: string;
  closedAt: string | null;
}

// API request/response shapes
export interface AuthPayload {
  userId: string;
  email: string;
}

export interface ApiError {
  error: string;
  details?: string;
}

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
  }
}
