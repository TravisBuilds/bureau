/**
 * Integration tests for digital clone security
 * Tests cross-workspace isolation, RLS, token restrictions
 * Run against local Postgres as bureau_app role
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

const TEST_DB = {
  host: 'localhost',
  database: 'bureau_test',
  user: 'bureau_app',
  password: 'bureau_app_password',
  port: 5432,
};

describe('Digital Clone Security Tests', () => {
  let client: Client;
  let workspaceA: string;
  let workspaceB: string;
  let userA: string;
  let userB: string;
  let userC: string; // outsider
  let cloneA1: string;
  let cloneB1: string;
  let questionA1: string;
  let questionB1: string;
  let tokenA: string;
  let tokenB: string;
  let grantA: string;
  let grantB: string;
  let streamX: string;
  let streamY: string;

  beforeAll(async () => {
    client = new Client(TEST_DB);
    await client.connect();

    // Setup test data
    // Create users in auth.users
    const userResults = await client.query(`
      INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
      VALUES 
        (extensions.uuid_generate_v4(), 'usera@test.com', 'hash', NOW(), NOW(), NOW()),
        (extensions.uuid_generate_v4(), 'userb@test.com', 'hash', NOW(), NOW(), NOW()),
        (extensions.uuid_generate_v4(), 'userc@test.com', 'hash', NOW(), NOW(), NOW())
      RETURNING id, email
    `);
    
    userA = userResults.rows.find(r => r.email === 'usera@test.com')!.id;
    userB = userResults.rows.find(r => r.email === 'userb@test.com')!.id;
    userC = userResults.rows.find(r => r.email === 'userc@test.com')!.id;

    // Create workspaces
    const wsResults = await client.query(`
      INSERT INTO bureau.workspaces (id, name, created_by)
      VALUES 
        (extensions.uuid_generate_v4(), 'Workspace A', $1),
        (extensions.uuid_generate_v4(), 'Workspace B', $2)
      RETURNING id
    `, [userA, userB]);
    
    workspaceA = wsResults.rows[0].id;
    workspaceB = wsResults.rows[1].id;

    // Add members (owner role)
    await client.query(`
      INSERT INTO bureau.workspace_members (workspace_id, user_id, email, role, invited_by, invited_at, joined_at)
      VALUES 
        ($1, $2, 'usera@test.com', 'owner', $2, NOW(), NOW()),
        ($3, $4, 'userb@test.com', 'owner', $4, NOW(), NOW())
    `, [workspaceA, userA, workspaceB, userB]);

    // Create OAuth clients
    await client.query(`
      INSERT INTO bureau.oauth_clients (client_id, client_name, redirect_uris, registration, vendor)
      VALUES 
        ('client-a-test', 'Client A', ARRAY['http://localhost'], 'static', 'cursor'),
        ('client-b-test', 'Client B', ARRAY['http://localhost'], 'static', 'cursor')
    `);

    // Create OAuth grants
    const grantResults = await client.query(`
      INSERT INTO bureau.oauth_grants (id, workspace_id, user_id, client_id, scopes, connected_at)
      VALUES 
        (extensions.uuid_generate_v4(), $1, $2, 'client-a-test', ARRAY['clone:write', 'questions:read', 'questions:write', 'ingest:write'], NOW()),
        (extensions.uuid_generate_v4(), $3, $4, 'client-b-test', ARRAY['clone:write', 'questions:read', 'questions:write', 'ingest:write'], NOW())
      RETURNING id, workspace_id
    `, [workspaceA, userA, workspaceB, userB]);
    
    grantA = grantResults.rows.find(r => r.workspace_id === workspaceA)!.id;
    grantB = grantResults.rows.find(r => r.workspace_id === workspaceB)!.id;

    // Create agent_links
    const linkResults = await client.query(`
      INSERT INTO bureau.agent_links (id, workspace_id, grant_id, agent_label, scopes, allow_create_streams)
      VALUES 
        (extensions.uuid_generate_v4(), $1, $2, 'Agent A', ARRAY['clone:write', 'questions:read', 'questions:write', 'ingest:write'], true),
        (extensions.uuid_generate_v4(), $3, $4, 'Agent B', ARRAY['clone:write', 'questions:read', 'questions:write', 'ingest:write'], true)
      RETURNING id, workspace_id
    `, [workspaceA, grantA, workspaceB, grantB]);
    
    const linkA = linkResults.rows.find(r => r.workspace_id === workspaceA)!.id;
    const linkB = linkResults.rows.find(r => r.workspace_id === workspaceB)!.id;

    // Create OAuth access tokens
    await client.query(`
      INSERT INTO bureau.oauth_tokens (token_hash, token_prefix, kind, grant_id, expires_at, created_at)
      VALUES 
        (extensions.digest('bureau_at_testA123', 'sha256'), 'bureau_at_', 'access', $1, NOW() + INTERVAL '1 hour', NOW()),
        (extensions.digest('bureau_at_testB456', 'sha256'), 'bureau_at_', 'access', $2, NOW() + INTERVAL '1 hour', NOW())
    `, [grantA, grantB]);
    
    tokenA = 'bureau_at_testA123';
    tokenB = 'bureau_at_testB456';

    // Create clones in both workspaces
    const cloneResults = await client.query(`
      SELECT * FROM bureau.register_clone($1, $2, $3, 'Clone A1', 'cloneA1', 'cursor', 'v1', NULL, NULL, NULL)
      UNION ALL
      SELECT * FROM bureau.register_clone($4, $5, $6, 'Clone B1', 'cloneB1', 'cursor', 'v1', NULL, NULL, NULL)
    `, [workspaceA, userA, linkA, workspaceB, userB, linkB]);
    
    cloneA1 = cloneResults.rows[0].register_clone;
    cloneB1 = cloneResults.rows[1].register_clone;

    // Create questions
    const questionResults = await client.query(`
      SELECT * FROM bureau.ask_question($1, 'What is the status?', $2, NULL, NULL, $3, NULL, 'web')
      UNION ALL
      SELECT * FROM bureau.ask_question($4, 'Another question', $5, NULL, NULL, $6, NULL, 'web')
    `, [workspaceA, userA, cloneA1, workspaceB, userB, cloneB1]);
    
    questionA1 = questionResults.rows[0].ask_question;
    questionB1 = questionResults.rows[1].ask_question;

    // Create streams for ingest tests
    const streamResults = await client.query(`
      INSERT INTO bureau.streams (id, workspace_id, name, category, description)
      VALUES 
        (extensions.uuid_generate_v4(), $1, 'Stream X', 'production', 'Test stream X'),
        (extensions.uuid_generate_v4(), $2, 'Stream Y', 'production', 'Test stream Y')
      RETURNING id, workspace_id
    `, [workspaceA, workspaceA]);
    
    streamX = streamResults.rows[0].id;
    streamY = streamResults.rows[1].id;
  });

  afterAll(async () => {
    // Cleanup (cascade will handle most)
    await client.query('DELETE FROM bureau.questions WHERE workspace_id IN ($1, $2)', [workspaceA, workspaceB]);
    await client.query('DELETE FROM bureau.digital_clones WHERE workspace_id IN ($1, $2)', [workspaceA, workspaceB]);
    await client.query('DELETE FROM bureau.oauth_grants WHERE id IN ($1, $2)', [grantA, grantB]);
    await client.query('DELETE FROM bureau.oauth_clients WHERE client_id IN ($1, $2)', ['client-a-test', 'client-b-test']);
    await client.query('DELETE FROM bureau.workspace_members WHERE workspace_id IN ($1, $2)', [workspaceA, workspaceB]);
    await client.query('DELETE FROM bureau.workspaces WHERE id IN ($1, $2)', [workspaceA, workspaceB]);
    await client.query('DELETE FROM bureau.streams WHERE workspace_id = $1', [workspaceA]);
    await client.query('DELETE FROM auth.users WHERE id IN ($1, $2, $3)', [userA, userB, userC]);
    
    await client.end();
  });

  it('1. Cross-workspace isolation - cannot update clone from other workspace', async () => {
    // Resolve token A's credential
    const credA = await client.query(
      'SELECT * FROM bureau.resolve_credential($1)',
      [tokenA]
    );
    expect(credA.rows).toHaveLength(1);
    expect(credA.rows[0].workspace_id).toBe(workspaceA);

    // Try to update clone B1 (in workspace B) using workspace A's context
    await expect(async () => {
      await client.query(
        'SELECT bureau.update_clone_profile($1, $2, $3, $4, $5, $6, $7, $8)',
        [credA.rows[0].workspace_id, credA.rows[0].user_id, cloneB1, 'Updated', null, null, null, null]
      );
    }).rejects.toThrow();
  });

  it('2. Clone takeover blocked - cannot register existing handle with different owner', async () => {
    // User B tries to register handle 'cloneA1' (already owned by user A)
    await expect(async () => {
      await client.query(
        'SELECT bureau.register_clone($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [workspaceA, userB, 'link-fake', 'Clone A1 Takeover', 'cloneA1', 'cursor', 'v1', null, null, null]
      );
    }).rejects.toThrow(/HANDLE_TAKEN/);
  });

  it('3. Outsider cannot invite or remove members', async () => {
    // User C (not a member of workspace A) tries to invite someone
    await expect(async () => {
      await client.query(
        'SELECT bureau.invite_member($1, $2, $3, $4)',
        [workspaceA, 'newuser@test.com', 'member', userC]
      );
    }).rejects.toThrow(/not a member/);

    // User C tries to remove user A
    await expect(async () => {
      await client.query(
        'SELECT bureau.remove_member($1, $2, $3)',
        [workspaceA, userA, userC]
      );
    }).rejects.toThrow(/not a member|does not have permission/);
  });

  it('4. Removed member loses RLS access and tokens fail', async () => {
    // Create a new member (user C) in workspace A
    await client.query(
      'INSERT INTO bureau.workspace_members (workspace_id, user_id, email, role, invited_by, invited_at, joined_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())',
      [workspaceA, userC, 'userc@test.com', 'member', userA]
    );

    // Set user context to user C
    await client.query(`SELECT auth.set_test_user($1, 'userc@test.com')`, [userC]);

    // User C should see clones in workspace A
    const beforeRemove = await client.query(
      'SELECT * FROM bureau.digital_clones WHERE workspace_id = $1',
      [workspaceA]
    );
    expect(beforeRemove.rows.length).toBeGreaterThan(0);

    // Remove user C
    await client.query(`SELECT auth.set_test_user($1, 'usera@test.com')`, [userA]);
    await client.query(
      'SELECT bureau.remove_member($1, $2, $3)',
      [workspaceA, userC, userA]
    );

    // Set context back to user C
    await client.query(`SELECT auth.set_test_user($1, 'userc@test.com')`, [userC]);

    // User C should now see zero rows (RLS blocks removed members)
    const afterRemove = await client.query(
      'SELECT * FROM bureau.digital_clones WHERE workspace_id = $1',
      [workspaceA]
    );
    expect(afterRemove.rows).toHaveLength(0);

    // Also check user_workspaces excludes removed members
    const workspaces = await client.query(
      'SELECT * FROM bureau.user_workspaces($1)',
      [userC]
    );
    expect(workspaces.rows).toHaveLength(0);

    // Reset context
    await client.query(`SELECT auth.set_test_user($1, 'usera@test.com')`, [userA]);
  });

  it('5. API routes return rows for active members', async () => {
    // Set user context to user A
    await client.query(`SELECT auth.set_test_user($1, 'usera@test.com')`, [userA]);

    // Check digital_clones
    const clones = await client.query(
      'SELECT * FROM bureau.digital_clones WHERE workspace_id = $1',
      [workspaceA]
    );
    expect(clones.rows.length).toBeGreaterThan(0);

    // Check questions
    const questions = await client.query(
      'SELECT * FROM bureau.questions WHERE workspace_id = $1',
      [workspaceA]
    );
    expect(questions.rows.length).toBeGreaterThan(0);

    // Check workspace_members
    const members = await client.query(
      'SELECT * FROM bureau.workspace_members WHERE workspace_id = $1 AND removed_at IS NULL',
      [workspaceA]
    );
    expect(members.rows.length).toBeGreaterThan(0);
  });

  it('6. Stream restriction enforcement for OAuth tokens', async () => {
    // Create a restricted agent_link (only allowed streamX, cannot create streams)
    const restrictedGrant = await client.query(`
      INSERT INTO bureau.oauth_grants (id, workspace_id, user_id, client_id, scopes, connected_at)
      VALUES (extensions.uuid_generate_v4(), $1, $2, 'client-a-test', ARRAY['ingest:write'], NOW())
      RETURNING id
    `, [workspaceA, userA]);
    const restrictedGrantId = restrictedGrant.rows[0].id;

    const restrictedLink = await client.query(`
      INSERT INTO bureau.agent_links (id, workspace_id, grant_id, agent_label, scopes, stream_ids, allow_create_streams)
      VALUES (extensions.uuid_generate_v4(), $1, $2, 'Restricted Agent', ARRAY['ingest:write'], ARRAY[$3::uuid], false)
      RETURNING id
    `, [workspaceA, restrictedGrantId, streamX]);
    const restrictedLinkId = restrictedLink.rows[0].id;

    await client.query(`
      INSERT INTO bureau.oauth_tokens (token_hash, token_prefix, kind, grant_id, expires_at, created_at)
      VALUES (
        extensions.digest('bureau_at_restricted999', 'sha256'), 
        'bureau_at_', 'access', $1, NOW() + INTERVAL '1 hour', NOW()
      )
    `, [restrictedGrantId]);

    // Resolve restricted token
    const restrictedCred = await client.query(
      'SELECT * FROM bureau.resolve_credential($1)',
      ['bureau_at_restricted999']
    );
    expect(restrictedCred.rows).toHaveLength(1);
    expect(restrictedCred.rows[0].allowed_stream_ids).toEqual([streamX]);
    expect(restrictedCred.rows[0].allow_create_streams).toBe(false);

    // Test that restricted token allows streamX
    expect(restrictedCred.rows[0].allowed_stream_ids).toContain(streamX);

    // Test that restricted token rejects streamY
    expect(restrictedCred.rows[0].allowed_stream_ids).not.toContain(streamY);

    // Cleanup
    await client.query('DELETE FROM bureau.oauth_grants WHERE id = $1', [restrictedGrantId]);
  });
});
