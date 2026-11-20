import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARACTER_VIDEO_STATES,
  CHARACTER_TIER_VIDEO_SETS,
  DEFAULT_CHARACTER_VIDEO_STATE,
  STATE_PRIORITY_ORDER,
  STATE_PRIORITY_WEIGHTS,
  isValidCharacterVideoState,
  getStatePriority,
  isLoopingState,
  resolveHighestPriorityState,
  getCharacterTierVideoSet,
  resolveCharacterVideo,
  getCharacterStateLabel,
  type CharacterVideoState,
} from './character-video';

describe('Character Video Architecture & State Resolver', () => {
  it('defines all 7 required character video states', () => {
    const expectedStates: CharacterVideoState[] = [
      'connecting',
      'waking',
      'idle',
      'working',
      'making_something',
      'waiting_for_subagents',
      'milestone_level_up',
    ];

    assert.equal(CHARACTER_VIDEO_STATES.length, 7);
    for (const state of expectedStates) {
      assert.ok(CHARACTER_VIDEO_STATES.includes(state), `Missing state: ${state}`);
      assert.ok(isValidCharacterVideoState(state), `isValidCharacterVideoState failed for: ${state}`);
    }
    assert.equal(isValidCharacterVideoState('non_existent_state'), false);
    assert.equal(isValidCharacterVideoState(null), false);
    assert.equal(isValidCharacterVideoState(123), false);
  });

  it('verifies priority hierarchy order: milestone_level_up > connecting > waking > making_something > working > waiting_for_subagents > idle', () => {
    const expectedPriorityOrder: CharacterVideoState[] = [
      'milestone_level_up',
      'connecting',
      'waking',
      'making_something',
      'working',
      'waiting_for_subagents',
      'idle',
    ];

    assert.deepEqual([...STATE_PRIORITY_ORDER], expectedPriorityOrder);
    assert.equal(STATE_PRIORITY_WEIGHTS.milestone_level_up, 700);

    // Verify weights strictly decrease down the priority order
    for (let i = 0; i < expectedPriorityOrder.length - 1; i++) {
      const current = expectedPriorityOrder[i];
      const next = expectedPriorityOrder[i + 1];
      assert.ok(
        getStatePriority(current) > getStatePriority(next),
        `Weight of ${current} (${getStatePriority(current)}) should be greater than ${next} (${getStatePriority(next)})`,
      );
    }
  });

  it('correctly resolves the highest priority state from various sets', () => {
    // When idle and milestone_level_up compete, milestone_level_up wins
    assert.equal(
      resolveHighestPriorityState(['idle', 'milestone_level_up', 'working']),
      'milestone_level_up',
    );

    // Connecting vs waking
    assert.equal(
      resolveHighestPriorityState(['idle', 'waking', 'connecting']),
      'connecting',
    );

    // Making something vs working
    assert.equal(
      resolveHighestPriorityState(['idle', 'working', 'making_something']),
      'making_something',
    );

    // Working vs waiting_for_subagents
    assert.equal(
      resolveHighestPriorityState(['waiting_for_subagents', 'working']),
      'working',
    );

    // Waiting for subagents vs idle
    assert.equal(
      resolveHighestPriorityState(['waiting_for_subagents', 'idle']),
      'waiting_for_subagents',
    );

    // Empty list returns default 'idle'
    assert.equal(resolveHighestPriorityState([]), DEFAULT_CHARACTER_VIDEO_STATE);

    // Ignores invalid or null states
    assert.equal(
      resolveHighestPriorityState([null, undefined, 'unknown_state', 'waking']),
      'waking',
    );
  });

  it('configures looping and duration metadata accurately', () => {
    assert.equal(isLoopingState('idle'), true);
    assert.equal(isLoopingState('connecting'), true);
    assert.equal(isLoopingState('working'), true);
    assert.equal(isLoopingState('making_something'), true);
    assert.equal(isLoopingState('waiting_for_subagents'), true);

    // Non-looping milestone and waking
    assert.equal(isLoopingState('milestone_level_up'), false);
    assert.equal(isLoopingState('waking'), false);
  });

  it('builds registry matching all 7 level tiers up to Lv 100+', () => {
    assert.equal(CHARACTER_TIER_VIDEO_SETS.length, 7);

    const [t1, t2, t3, t4, t5, t6, t7] = CHARACTER_TIER_VIDEO_SETS;

    // Tier 1 (Lv 1-2): Beginner Adventurer ('/videos/characters/level-1/')
    assert.equal(t1.levelMin, 1);
    assert.equal(t1.levelMax, 2);
    assert.equal(t1.tierName, 'Beginner Adventurer');
    assert.equal(t1.videos.idle.videoUrl, '/videos/characters/level-1/idle.mp4');
    assert.equal(t1.posterUrl, '/images/characters/character-level-1.png');

    // Tier 2 (Lv 3-5): Code Warrior ('/videos/characters/level-3/')
    assert.equal(t2.levelMin, 3);
    assert.equal(t2.levelMax, 5);
    assert.equal(t2.tierName, 'Code Warrior');
    assert.equal(t2.videos.idle.videoUrl, '/videos/characters/level-3/idle.mp4');
    assert.equal(t2.posterUrl, '/images/characters/character-level-3.png');

    // Tier 3 (Lv 6-9): Elite Knight Mage ('/videos/characters/level-6/')
    assert.equal(t3.levelMin, 6);
    assert.equal(t3.levelMax, 9);
    assert.equal(t3.tierName, 'Elite Knight Mage');
    assert.equal(t3.videos.idle.videoUrl, '/videos/characters/level-6/idle.mp4');
    assert.equal(t3.posterUrl, '/images/characters/character-level-6.png');

    // Tier 4 (Lv 10-19): Legendary Grandmaster ('/videos/characters/level-10/')
    assert.equal(t4.levelMin, 10);
    assert.equal(t4.levelMax, 19);
    assert.equal(t4.tierName, 'Legendary Grandmaster');
    assert.equal(t4.videos.idle.videoUrl, '/videos/characters/level-10/idle.mp4');
    assert.equal(t4.posterUrl, '/images/characters/character-level-10.png');

    // Tier 5..7 (Lv 20 to 100+)
    assert.equal(t5.levelMin, 20);
    assert.equal(t5.tierName, 'Astral Sovereign');
    assert.equal(t6.levelMin, 40);
    assert.equal(t6.tierName, 'Void Archon');
    assert.equal(t7.levelMin, 70);
    assert.equal(t7.tierName, 'Celestial Seraph');
  });

  it('maps levels correctly via getCharacterTierVideoSet', () => {
    // Level 1, 2 -> Tier 1
    assert.equal(getCharacterTierVideoSet(1).tierName, 'Beginner Adventurer');
    assert.equal(getCharacterTierVideoSet(2).tierName, 'Beginner Adventurer');

    // Level 3, 4, 5 -> Tier 2
    assert.equal(getCharacterTierVideoSet(3).tierName, 'Code Warrior');
    assert.equal(getCharacterTierVideoSet(5).tierName, 'Code Warrior');

    // Level 6, 7, 8, 9 -> Tier 3
    assert.equal(getCharacterTierVideoSet(6).tierName, 'Elite Knight Mage');
    assert.equal(getCharacterTierVideoSet(9).tierName, 'Elite Knight Mage');

    // Level 10..19 -> Tier 4
    assert.equal(getCharacterTierVideoSet(10).tierName, 'Legendary Grandmaster');
    assert.equal(getCharacterTierVideoSet(19).tierName, 'Legendary Grandmaster');

    // Level 20..69 -> Tiers 5-6
    assert.equal(getCharacterTierVideoSet(25).tierName, 'Astral Sovereign');
    assert.equal(getCharacterTierVideoSet(50).tierName, 'Void Archon');

    // Level 70..100+ -> Tier 7
    assert.equal(getCharacterTierVideoSet(70).tierName, 'Celestial Seraph');
    assert.equal(getCharacterTierVideoSet(100).tierName, 'Celestial Seraph');
    assert.equal(getCharacterTierVideoSet(150).tierName, 'Celestial Seraph');

    // Edge cases: 0 or negative -> clamps to Level 1
    assert.equal(getCharacterTierVideoSet(0).tierName, 'Beginner Adventurer');
    assert.equal(getCharacterTierVideoSet(-5).tierName, 'Beginner Adventurer');
    assert.equal(getCharacterTierVideoSet(NaN).tierName, 'Beginner Adventurer');
  });

  it('resolves character video asset and bannerBgUrl accurately via resolveCharacterVideo', () => {
    const videoLv1Working = resolveCharacterVideo(1, 'working');
    assert.equal(videoLv1Working.state, 'working');
    assert.equal(videoLv1Working.videoUrl, '/videos/characters/level-1/working.mp4');
    assert.equal(videoLv1Working.posterUrl, '/images/characters/character-level-1.png');
    assert.equal(videoLv1Working.loop, true);
    assert.equal(videoLv1Working.bannerBgUrl, '/images/dashboard/hero-bg.jpg');
    assert.ok(videoLv1Working.title.length > 0);
    assert.ok(videoLv1Working.description.length > 0);

    const videoLv10Milestone = resolveCharacterVideo(10, 'milestone_level_up');
    assert.equal(videoLv10Milestone.state, 'milestone_level_up');
    assert.equal(videoLv10Milestone.videoUrl, '/videos/characters/level-10/milestone_level_up.mp4');
    assert.equal(videoLv10Milestone.posterUrl, '/images/characters/character-level-10.png');
    assert.equal(videoLv10Milestone.loop, false);
    assert.equal(videoLv10Milestone.durationMs, 4000);
    assert.equal(videoLv10Milestone.bannerBgUrl, '/images/dashboard/hero-bg.jpg');

    // Default state fallback
    const videoDefault = resolveCharacterVideo(4);
    assert.equal(videoDefault.state, 'idle');
    assert.equal(videoDefault.videoUrl, '/videos/characters/level-3/idle.mp4');
  });

  it('provides state labels in both vi and en', () => {
    const viLabel = getCharacterStateLabel('milestone_level_up', 'vi');
    assert.equal(viLabel.label, 'Đột Phá Thăng Cấp');
    assert.equal(viLabel.badge, 'Milestone');

    const enLabel = getCharacterStateLabel('milestone_level_up', 'en');
    assert.equal(enLabel.label, 'Milestone Level Up');
  });
});
