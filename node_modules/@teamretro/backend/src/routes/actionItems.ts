/**
 * @module routes/actionItems
 * @description Action item routes — handles creating, updating, and deleting
 * action items on a board. All routes are scoped under
 * /api/teams/:teamId/boards/:boardId/action-items.
 */

import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/store';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

const router = Router({ mergeParams: true });

/**
 * @route POST /api/teams/:teamId/boards/:boardId/action-items
 * @access Private (requireAuth)
 * @param {string} teamId - The team's unique identifier
 * @param {string} boardId - The board's unique identifier
 * @body {string} text - Action item description (min 1 character)
 * @body {string|null} [ownerId] - Optional user ID of the team member assigned to this item
 * @returns {201} The newly created action item object
 * @returns {400} { error: string } — ownerId is not a team member
 * @returns {403} { error: string } — current user is not a member of the team
 * @returns {404} { error: string } — team or board not found
 * @returns {409} { error: string } — board is still in "open" status (action items require voting or closed)
 */
// POST /teams/:teamId/boards/:boardId/action-items
router.post(
  '/',
  requireAuth,
  validateBody({ text: { type: 'string', required: true, minLength: 1, maxLength: 1000 } }),
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
    if (board.status === 'open') {
      res.status(409).json({ error: 'Action items can only be added during voting or after closing' });
      return;
    }

    // Validate ownerId if provided
    const ownerId: string | null = req.body.ownerId ?? null;
    if (ownerId && !team.members.some((m) => m.userId === ownerId)) {
      res.status(400).json({ error: 'Owner must be a team member' });
      return;
    }

    const now = new Date().toISOString();
    const item = db.saveActionItem({
      id: uuidv4(),
      boardId: board.id,
      text: req.body.text.trim(),
      ownerId,
      completed: false,
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json(item);
  }
);

/**
 * @route PATCH /api/teams/:teamId/boards/:boardId/action-items/:itemId
 * @access Private (requireAuth)
 * @param {string} teamId - The team's unique identifier
 * @param {string} boardId - The board's unique identifier
 * @param {string} itemId - The action item's unique identifier
 * @body {string} [text] - Updated action item description
 * @body {boolean} [completed] - Updated completion status
 * @body {string|null} [ownerId] - Updated assignee user ID (must be a team member, or null to unassign)
 * @returns {200} The updated action item object
 * @returns {400} { error: string } — ownerId is not a team member
 * @returns {403} { error: string } — current user is not a member of the team
 * @returns {404} { error: string } — team or action item not found
 */
// PATCH /teams/:teamId/boards/:boardId/action-items/:itemId
router.patch('/:itemId', requireAuth, (req: AuthRequest, res: Response) => {
  const team = db.getTeam(req.params.teamId);
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }
  if (!team.members.some((m) => m.userId === req.user!.userId)) {
    res.status(403).json({ error: 'Not a member of this team' });
    return;
  }

  const item = db.getActionItem(req.params.itemId);
  if (!item || item.boardId !== req.params.boardId) {
    res.status(404).json({ error: 'Action item not found' });
    return;
  }

  if (req.body.text !== undefined) item.text = req.body.text.trim();
  if (req.body.completed !== undefined) item.completed = Boolean(req.body.completed);
  if (req.body.ownerId !== undefined) {
    const ownerId = req.body.ownerId;
    if (ownerId !== null && !team.members.some((m) => m.userId === ownerId)) {
      res.status(400).json({ error: 'Owner must be a team member' });
      return;
    }
    item.ownerId = ownerId;
  }

  item.updatedAt = new Date().toISOString();
  db.saveActionItem(item);
  res.json(item);
});

/**
 * @route DELETE /api/teams/:teamId/boards/:boardId/action-items/:itemId
 * @access Private (requireAuth)
 * @param {string} teamId - The team's unique identifier
 * @param {string} boardId - The board's unique identifier
 * @param {string} itemId - The action item's unique identifier
 * @returns {204} No content — action item deleted successfully
 * @returns {403} { error: string } — current user is not the item owner or a team owner
 * @returns {404} { error: string } — team or action item not found
 */
// DELETE /teams/:teamId/boards/:boardId/action-items/:itemId
router.delete('/:itemId', requireAuth, (req: AuthRequest, res: Response) => {
  const team = db.getTeam(req.params.teamId);
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  const member = team.members.find((m) => m.userId === req.user!.userId);
  if (!member) {
    res.status(403).json({ error: 'Not a member of this team' });
    return;
  }

  const item = db.getActionItem(req.params.itemId);
  if (!item || item.boardId !== req.params.boardId) {
    res.status(404).json({ error: 'Action item not found' });
    return;
  }

  // Only owner or item owner can delete
  const isTeamOwner = member.role === 'owner';
  const isItemOwner = item.ownerId === req.user!.userId;
  if (!isTeamOwner && !isItemOwner) {
    res.status(403).json({ error: 'Not authorized to delete this action item' });
    return;
  }

  db.deleteActionItem(item.id);
  res.status(204).send();
});

export default router;
