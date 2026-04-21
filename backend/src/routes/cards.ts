/**
 * @module routes/cards
 * @description Card management routes — handles creating cards on a board,
 * deleting cards, and toggling votes on cards. All routes are scoped under
 * /api/teams/:teamId/boards/:boardId/cards.
 */

import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/store';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { CardCategory } from '../types';

const router = Router({ mergeParams: true });

/**
 * @route POST /api/teams/:teamId/boards/:boardId/cards
 * @access Private (requireAuth)
 * @param {string} teamId - The team's unique identifier
 * @param {string} boardId - The board's unique identifier
 * @body {string} text - Card content (min 1 character)
 * @body {string} category - Card category; must be one of: "went_well", "to_improve", "action_item"
 * @returns {201} { ...card, voteCount: number, hasVoted: boolean } — card created
 * @returns {400} { error: string } — invalid category
 * @returns {403} { error: string } — current user is not a member of the team
 * @returns {404} { error: string } — team or board not found
 * @returns {409} { error: string } — board is not in "open" status
 */
// POST /teams/:teamId/boards/:boardId/cards
router.post(
  '/',
  requireAuth,
  validateBody({
    text: { type: 'string', required: true, minLength: 1, maxLength: 1000 },
    category: { type: 'string', required: true, enum: ['went_well', 'to_improve', 'action_item'] },
  }),
  (req: AuthRequest, res: Response) => {
    const team = db.getTeam(req.params.teamId);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    if (!team.members.some((m) => m.userId === req.user!.userId)) {
      res.status(403).json({ error: 'Not a member of this team' });
      return;
    }

    const board = db.getBoard(req.params.boardId);
    if (!board || board.teamId !== req.params.teamId) {
      res.status(404).json({ error: 'Board not found' });
      return;
    }
    if (board.status !== 'open') {
      res.status(409).json({ error: 'Board is not accepting new cards' });
      return;
    }

    const category: CardCategory = req.body.category;

    const card = db.saveCard({
      id: uuidv4(),
      boardId: board.id,
      category,
      text: req.body.text.trim(),
      authorId: board.anonymousSubmissions ? null : req.user!.userId,
      votes: [],
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({
      ...card,
      voteCount: 0,
      hasVoted: false,
    });
  }
);

/**
 * @route DELETE /api/teams/:teamId/boards/:boardId/cards/:cardId
 * @access Private (requireAuth)
 * @param {string} teamId - The team's unique identifier
 * @param {string} boardId - The board's unique identifier
 * @param {string} cardId - The card's unique identifier
 * @returns {204} No content — card deleted successfully
 * @returns {403} { error: string } — current user is not the card author or a team owner
 * @returns {404} { error: string } — board or card not found
 */
// DELETE /teams/:teamId/boards/:boardId/cards/:cardId
router.delete('/:cardId', requireAuth, (req: AuthRequest, res: Response) => {
  const board = db.getBoard(req.params.boardId);
  if (!board || board.teamId !== req.params.teamId) {
    res.status(404).json({ error: 'Board not found' });
    return;
  }

  const card = db.getCard(req.params.cardId);
  if (!card || card.boardId !== board.id) {
    res.status(404).json({ error: 'Card not found' });
    return;
  }

  // Only the card author (if not anonymous) or a team owner can delete
  const team = db.getTeam(req.params.teamId)!;
  const isOwner = team.members.find((m) => m.userId === req.user!.userId)?.role === 'owner';
  const isAuthor = card.authorId === req.user!.userId;

  if (!isOwner && !isAuthor) {
    res.status(403).json({ error: 'Not authorized to delete this card' });
    return;
  }

  db.deleteCard(card.id);
  res.status(204).send();
});

/**
 * @route POST /api/teams/:teamId/boards/:boardId/cards/:cardId/vote
 * @access Private (requireAuth)
 * @param {string} teamId - The team's unique identifier
 * @param {string} boardId - The board's unique identifier
 * @param {string} cardId - The card's unique identifier
 * @returns {200} { voteCount: number, hasVoted: boolean } — vote toggled (added or removed)
 * @returns {403} { error: string } — current user is not a member of the team
 * @returns {404} { error: string } — board or card not found
 * @returns {409} { error: string } — board is not in "voting" status
 */
// POST /teams/:teamId/boards/:boardId/cards/:cardId/vote
router.post('/:cardId/vote', requireAuth, (req: AuthRequest, res: Response) => {
  const board = db.getBoard(req.params.boardId);
  if (!board || board.teamId !== req.params.teamId) {
    res.status(404).json({ error: 'Board not found' });
    return;
  }
  if (board.status !== 'voting') {
    res.status(409).json({ error: 'Board is not in voting phase' });
    return;
  }

  const team = db.getTeam(req.params.teamId)!;
  if (!team.members.some((m) => m.userId === req.user!.userId)) {
    res.status(403).json({ error: 'Not a member of this team' });
    return;
  }

  const card = db.getCard(req.params.cardId);
  if (!card || card.boardId !== board.id) {
    res.status(404).json({ error: 'Card not found' });
    return;
  }

  const userId = req.user!.userId;
  const alreadyVoted = card.votes.includes(userId);

  if (alreadyVoted) {
    // Toggle: remove vote
    card.votes = card.votes.filter((v) => v !== userId);
  } else {
    card.votes.push(userId);
  }

  db.saveCard(card);
  res.json({ voteCount: card.votes.length, hasVoted: !alreadyVoted });
});

export default router;
