/**
 * @module routes/boards
 * @description Board management routes — handles creating boards, listing boards
 * for a team, retrieving a board with its cards and action items, and updating
 * board status. All routes are scoped under /api/teams/:teamId/boards.
 */

import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/store';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { BoardStatus } from '../types';

const router = Router({ mergeParams: true });

// Helper: assert user is a team member, returns member record or sends 403
function assertTeamMember(teamId: string, userId: string, res: Response): boolean {
  const team = db.getTeam(teamId);
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return false;
  }
  const isMember = team.members.some((m) => m.userId === userId);
  if (!isMember) {
    res.status(403).json({ error: 'Not a member of this team' });
    return false;
  }
  return true;
}

/**
 * @route GET /api/teams/:teamId/boards
 * @access Private (requireAuth)
 * @param {string} teamId - The team's unique identifier
 * @returns {200} Array of board objects belonging to the team
 * @returns {403} { error: string } — current user is not a member of the team
 * @returns {404} { error: string } — team not found
 */
// GET /teams/:teamId/boards
router.get('/', requireAuth, (req: AuthRequest, res: Response) => {
  if (!assertTeamMember(req.params.teamId, req.user!.userId, res)) return;
  const boards = db.getBoardsForTeam(req.params.teamId);
  res.json(boards);
});

/**
 * @route POST /api/teams/:teamId/boards
 * @access Private (requireAuth)
 * @param {string} teamId - The team's unique identifier
 * @body {string} title - Board title (min 2 characters)
 * @body {boolean} [anonymousSubmissions=true] - Whether card authors are hidden from other members
 * @returns {201} The newly created board object
 * @returns {400} { error: string } — validation error (e.g. title too short)
 * @returns {403} { error: string } — current user is not a member of the team
 * @returns {404} { error: string } — team not found
 */
// POST /teams/:teamId/boards
router.post(
  '/',
  requireAuth,
  validateBody({ title: { type: 'string', required: true, minLength: 2, maxLength: 200 } }),
  (req: AuthRequest, res: Response) => {
    if (!assertTeamMember(req.params.teamId, req.user!.userId, res)) return;

    const board = db.saveBoard({
      id: uuidv4(),
      teamId: req.params.teamId,
      title: req.body.title.trim(),
      status: 'open',
      anonymousSubmissions: req.body.anonymousSubmissions !== false, // default true
      createdBy: req.user!.userId,
      createdAt: new Date().toISOString(),
      closedAt: null,
    });

    res.status(201).json(board);
  }
);

/**
 * @route GET /api/teams/:teamId/boards/:boardId
 * @access Private (requireAuth)
 * @param {string} teamId - The team's unique identifier
 * @param {string} boardId - The board's unique identifier
 * @returns {200} Board object including cards (with voteCount/hasVoted) and actionItems
 * @returns {403} { error: string } — current user is not a member of the team
 * @returns {404} { error: string } — team or board not found
 */
// GET /teams/:teamId/boards/:boardId
router.get('/:boardId', requireAuth, (req: AuthRequest, res: Response) => {
  if (!assertTeamMember(req.params.teamId, req.user!.userId, res)) return;

  const board = db.getBoard(req.params.boardId);
  if (!board || board.teamId !== req.params.teamId) {
    res.status(404).json({ error: 'Board not found' });
    return;
  }

  const cards = db.getCardsForBoard(board.id).map((card) => ({
    ...card,
    // Mask author if anonymous submissions enabled and not the card owner
    authorId:
      board.anonymousSubmissions && card.authorId !== req.user!.userId
        ? null
        : card.authorId,
    voteCount: card.votes.length,
    hasVoted: card.votes.includes(req.user!.userId),
  }));

  const actionItems = db.getActionItemsForBoard(board.id);

  res.json({ ...board, cards, actionItems });
});

/**
 * @route PATCH /api/teams/:teamId/boards/:boardId/status
 * @access Private (requireAuth)
 * @param {string} teamId - The team's unique identifier
 * @param {string} boardId - The board's unique identifier
 * @body {string} status - New board status; must be one of: "open", "voting", "closed"
 * @returns {200} Updated board object
 * @returns {400} { error: string } — invalid status value
 * @returns {403} { error: string } — current user is not a member of the team
 * @returns {404} { error: string } — team or board not found
 */
// PATCH /teams/:teamId/boards/:boardId/status
router.patch(
  '/:boardId/status',
  requireAuth,
  validateBody({ status: { type: 'string', required: true, enum: ['open', 'voting', 'closed'] } }),
  (req: AuthRequest, res: Response) => {
  if (!assertTeamMember(req.params.teamId, req.user!.userId, res)) return;

  const board = db.getBoard(req.params.boardId);
  if (!board || board.teamId !== req.params.teamId) {
    res.status(404).json({ error: 'Board not found' });
    return;
  }

  const newStatus: BoardStatus = req.body.status;
  board.status = newStatus;
  if (newStatus === 'closed') board.closedAt = new Date().toISOString();
  db.saveBoard(board);

  res.json(board);
});

export default router;
