/**
 * @module routes/teams
 * @description Team management routes — handles creating teams, listing teams,
 * retrieving team details, joining via invite code, and regenerating invite codes.
 */

import crypto from 'crypto';
import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/store';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

const router = Router();

// Helper: generate a cryptographically random invite code
function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/**
 * @route GET /api/teams
 * @access Private (requireAuth)
 * @returns {200} Array of team summaries the current user belongs to,
 *   each containing { id, name, inviteCode, memberCount, role, createdAt }
 */
// GET /teams — list teams for current user
router.get('/', requireAuth, (req: AuthRequest, res: Response) => {
  const teams = db.getTeamsForUser(req.user!.userId).map((t) => ({
    id: t.id,
    name: t.name,
    inviteCode: t.inviteCode,
    memberCount: t.members.length,
    role: t.members.find((m) => m.userId === req.user!.userId)?.role,
    createdAt: t.createdAt,
  }));
  res.json(teams);
});

/**
 * @route POST /api/teams
 * @access Private (requireAuth)
 * @body {string} name - Team name (min 2 characters)
 * @returns {201} { id, name, inviteCode, memberCount, role, createdAt } — team created
 * @returns {400} { error: string } — validation error (e.g. name too short)
 */
// POST /teams — create a team
router.post(
  '/',
  requireAuth,
  validateBody({ name: { type: 'string', required: true, minLength: 2, maxLength: 100 } }),
  (req: AuthRequest, res: Response) => {
    const team = db.saveTeam({
      id: uuidv4(),
      name: req.body.name.trim(),
      inviteCode: generateInviteCode(),
      members: [{ userId: req.user!.userId, role: 'owner', joinedAt: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({
      id: team.id,
      name: team.name,
      inviteCode: team.inviteCode,
      memberCount: 1,
      role: 'owner',
      createdAt: team.createdAt,
    });
  }
);

/**
 * @route GET /api/teams/:teamId
 * @access Private (requireAuth)
 * @param {string} teamId - The team's unique identifier
 * @returns {200} Team object with full member list { id, name, inviteCode, members, createdAt }
 * @returns {403} { error: string } — current user is not a member of the team
 * @returns {404} { error: string } — team not found
 */
// GET /teams/:teamId — get team details
router.get('/:teamId', requireAuth, (req: AuthRequest, res: Response) => {
  const team = db.getTeam(req.params.teamId);
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  const isMember = team.members.some((m) => m.userId === req.user!.userId);
  if (!isMember) {
    res.status(403).json({ error: 'Not a member of this team' });
    return;
  }

  const members = team.members.map((m) => {
    const user = db.getUser(m.userId);
    return {
      userId: m.userId,
      name: user?.name ?? 'Unknown',
      email: user?.email ?? '',
      role: m.role,
      joinedAt: m.joinedAt,
    };
  });

  res.json({ id: team.id, name: team.name, inviteCode: team.inviteCode, members, createdAt: team.createdAt });
});

/**
 * @route POST /api/teams/join/:inviteCode
 * @access Private (requireAuth)
 * @param {string} inviteCode - The team's invite code (case-insensitive)
 * @returns {200} { id, name, inviteCode, role } — successfully joined the team
 * @returns {404} { error: string } — invalid invite code
 * @returns {409} { error: string } — user is already a member of the team
 */
// POST /teams/join/:inviteCode — join via invite link
router.post('/join/:inviteCode', requireAuth, (req: AuthRequest, res: Response) => {
  const team = db.getTeamByInviteCode(req.params.inviteCode.toUpperCase());
  if (!team) {
    res.status(404).json({ error: 'Invalid invite code' });
    return;
  }

  const alreadyMember = team.members.some((m) => m.userId === req.user!.userId);
  if (alreadyMember) {
    res.status(409).json({ error: 'Already a member of this team' });
    return;
  }

  team.members.push({ userId: req.user!.userId, role: 'member', joinedAt: new Date().toISOString() });
  db.saveTeam(team);

  res.json({ id: team.id, name: team.name, inviteCode: team.inviteCode, role: 'member' });
});

/**
 * @route POST /api/teams/:teamId/regenerate-invite
 * @access Private (requireAuth — team owner only)
 * @param {string} teamId - The team's unique identifier
 * @returns {200} { inviteCode: string } — new invite code generated
 * @returns {403} { error: string } — current user is not the team owner
 * @returns {404} { error: string } — team not found
 */
// POST /teams/:teamId/regenerate-invite — regenerate invite code (owner only)
router.post('/:teamId/regenerate-invite', requireAuth, (req: AuthRequest, res: Response) => {
  const team = db.getTeam(req.params.teamId);
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  const member = team.members.find((m) => m.userId === req.user!.userId);
  if (!member || member.role !== 'owner') {
    res.status(403).json({ error: 'Only team owners can regenerate invite codes' });
    return;
  }

  team.inviteCode = generateInviteCode();
  db.saveTeam(team);
  res.json({ inviteCode: team.inviteCode });
});

export default router;
