import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Skill, UserSkill } from '../types';
import { Colors, ColorsType, useThemeColors, Spacing, Radius, FontSize } from '../utils/theme';
import { hasValidationQuestions } from '../data/validationCatalog';

interface CareerNodeProps {
  skill: Skill;
  userSkill: UserSkill;
  pathColor: { primary: string; dim: string; text: string; border: string };
  isFirst: boolean;
  isLast: boolean;
  onPress: () => void;
  onTestKnowledge?: () => void; // launches the knowledge check directly from the node nudge
  completedAt?: string;
  skillStreak?: number; // consecutive days with outputs for this skill
  validated?: boolean;  // true when user has passed the knowledge challenge
}

export default function CareerNode({
  skill,
  userSkill,
  pathColor,
  isFirst,
  isLast,
  onPress,
  onTestKnowledge,
  completedAt,
  skillStreak = 0,
  validated = false,
}: CareerNodeProps) {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  const { status } = userSkill;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const mountAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(mountAnim, {
      toValue: 1,
      duration: 400,
      delay: skill.order * 80,
      useNativeDriver: false,
    }).start();

    if (status === 'in_progress') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1600, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1600, useNativeDriver: false }),
        ])
      ).start();
    }
  }, [status]);

  const progressPct =
    skill.requiredOutputs > 0
      ? Math.min(100, Math.round((userSkill.outputCount / skill.requiredOutputs) * 100))
      : 0;

  const isCompleted = status === 'completed';
  const isInProgress = status === 'in_progress';
  const isAvailable = status === 'available';
  const isLocked = status === 'locked';

  const getIconBg = () => {
    if (isCompleted && validated) return Colors.gold;
    if (isCompleted) return Colors.success;
    if (isInProgress) return pathColor.primary;
    if (isAvailable) return Colors.cardAlt;
    return Colors.cardAlt;
  };

  const getCardBorder = () => {
    if (isCompleted && validated) return Colors.gold + '60';
    if (isCompleted) return Colors.success + '50';
    if (isInProgress) return pathColor.primary + '70';
    if (isAvailable) return Colors.primary + '40';
    return Colors.border;
  };

  const getCardBg = () => {
    if (isCompleted && validated) return Colors.gold + '10';
    if (isCompleted) return Colors.success + '12';
    if (isInProgress) return pathColor.dim;
    return Colors.card;
  };

  const statusLabel =
    isCompleted && validated
      ? '★ VALIDATED'
      : isCompleted
      ? '✓ COMPETENT'
      : isInProgress
      ? `${userSkill.outputCount}/${skill.requiredOutputs} outputs`
      : isAvailable
      ? 'READY'
      : 'LOCKED';

  const statusColor =
    isCompleted && validated
      ? Colors.gold
      : isCompleted
      ? Colors.success
      : isInProgress
      ? pathColor.text
      : isAvailable
      ? Colors.primaryLight
      : Colors.textMuted;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          opacity: mountAnim,
          transform: [
            {
              translateY: mountAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        },
      ]}
    >
      {/* Connector line above node */}
      {!isFirst && (
        <View style={styles.connectorWrapper}>
          <View
            style={[
              styles.connectorLine,
              {
                backgroundColor: isCompleted || isInProgress
                  ? pathColor.primary
                  : Colors.border,
                opacity: isCompleted || isInProgress ? 0.6 : 0.3,
              },
            ]}
          />
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.card,
          {
            borderColor: getCardBorder(),
            backgroundColor: getCardBg(),
          },
          isLocked && styles.cardLocked,
        ]}
        onPress={isLocked ? undefined : onPress}
        activeOpacity={isLocked ? 1 : 0.82}
        accessibilityRole="button"
        accessibilityLabel={
          isLocked
            ? `${skill.name} — locked`
            : isCompleted
            ? `${skill.name} — ${validated ? 'validated' : 'competent'}`
            : isInProgress
            ? `${skill.name} — ${userSkill.outputCount} of ${skill.requiredOutputs} outputs, +${skill.xpReward} XP on complete`
            : `${skill.name} — ready to start, +${skill.xpReward} XP on complete`
        }
        accessibilityState={{ disabled: isLocked }}
      >
        {/* Icon Box */}
        <View style={styles.iconWrapper}>
          {/* Glow ring for in-progress */}
          {isInProgress && (
            <Animated.View
              style={[
                styles.iconGlow,
                {
                  borderColor: pathColor.primary,
                  opacity: glowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.1, 0.5],
                  }),
                  transform: [
                    {
                      scale: glowAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.18],
                      }),
                    },
                  ],
                },
              ]}
            />
          )}

          <View
            style={[
              styles.iconBox,
              {
                backgroundColor: getIconBg(),
                opacity: isLocked ? 0.35 : 1,
              },
              isCompleted && !validated && {
                // @ts-ignore - web only
                boxShadow: `0 0 14px ${Colors.success}55`,
              },
            isCompleted && validated && {
                // @ts-ignore - web only
                boxShadow: `0 0 18px ${Colors.gold}60`,
              },
              isInProgress && {
                // @ts-ignore - web only
                boxShadow: `0 0 14px ${pathColor.primary}55`,
              },
            ]}
          >
            {isCompleted ? (
              <Text style={styles.iconCheck}>✓</Text>
            ) : isLocked ? (
              <Text style={[styles.iconEmoji, { opacity: 0.5 }]}>🔒</Text>
            ) : (
              <Text style={styles.iconEmoji}>{skill.icon}</Text>
            )}
          </View>
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text
            style={[
              styles.skillName,
              isLocked && { color: Colors.textMuted },
              isCompleted && { color: Colors.text },
            ]}
            numberOfLines={1}
          >
            {skill.name}
          </Text>

          <Text style={[styles.statusLabel, { color: statusColor }]}>
            {statusLabel}
          </Text>

          {/* Completion date */}
          {isCompleted && completedAt && (
            <Text style={styles.completedDate}>
              {validated ? 'Validated' : 'Competent'}{' '}
              {new Date(completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          )}

          {/* Validated badge */}
          {isCompleted && validated && (
            <View style={styles.validatedBadge}>
              <Text style={styles.validatedBadgeText}>★ Knowledge Validated</Text>
            </View>
          )}

          {/* Validation nudge for unvalidated completed skills (when questions exist).
              Tapping it launches the quiz directly (separate from the node's onPress). */}
          {isCompleted && !validated && hasValidationQuestions(skill as any) && (
            onTestKnowledge ? (
              // Pointer-only shortcut, deliberately NOT a button: the whole card is
              // already a <button> on RN-web, and ANY accessibilityRole="button" child
              // (Touchable or Text) renders a nested native <button> — invalid DOM
              // (validateDOMNesting) with ambiguous screen-reader activation. Keyboard
              // and screen-reader users reach the same action through the accessible
              // path: card → detail sheet → "Test Your Knowledge" CTA.
              <Text
                style={styles.validateNudge}
                onPress={onTestKnowledge}
                suppressHighlighting
              >
                Test your knowledge →
              </Text>
            ) : (
              <Text style={styles.validateNudge}>Test your knowledge →</Text>
            )
          )}

          {/* Progress bar */}
          {isInProgress && (
            <View style={styles.progressBg}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${progressPct}%` as any,
                    // @ts-ignore - web-only gradient
                    backgroundImage: `linear-gradient(90deg, ${pathColor.primary}, ${pathColor.text})`,
                    backgroundColor: pathColor.primary,
                  },
                ]}
              />
            </View>
          )}

          {/* Skill streak badge — shown when user has logged to this skill on consecutive days */}
          {skillStreak >= 2 && (isInProgress || isCompleted) && (
            <View style={styles.streakBadge}>
              <Text style={styles.streakBadgeText}>🔥 {skillStreak}-day streak</Text>
            </View>
          )}

          {/* XP reward hint */}
          {!isLocked && !isCompleted && (
            <Text style={styles.xpHint}>+{skill.xpReward} XP on complete</Text>
          )}
        </View>

        {/* Right indicator */}
        {(isAvailable || isInProgress) && (
          <View
            style={[
              styles.addBtn,
              {
                backgroundColor: pathColor.primary + '20',
                borderColor: pathColor.primary + '40',
              },
            ]}
          >
            <Text style={[styles.addBtnText, { color: pathColor.primary }]}>+</Text>
          </View>
        )}
        {isCompleted && (
          <View
            style={[
              styles.completedBadge,
              validated && {
                backgroundColor: Colors.gold + '25',
                borderColor: Colors.gold + '50',
              },
            ]}
          >
            <Text style={[styles.completedBadgeText, validated && { color: Colors.gold }]}>
              {validated ? '★' : '✓'}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const makeStyles = (Colors: ColorsType) => StyleSheet.create({
  wrapper: {
    marginBottom: 0,
  },
  connectorWrapper: {
    alignItems: 'center',
    height: 24,
  },
  connectorLine: {
    width: 2,
    flex: 1,
    borderRadius: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
  },
  cardLocked: {
    opacity: 0.55,
  },
  iconWrapper: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconGlow: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 14,
    borderWidth: 2,
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCheck: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.white,
  },
  iconEmoji: {
    fontSize: 22,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  skillName: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
  },
  statusLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  progressBg: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  streakBadge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: Colors.goldDim,
    borderWidth: 1,
    borderColor: Colors.gold + '4D',
    marginTop: 3,
  },
  streakBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.gold,
    letterSpacing: 0.3,
  },
  xpHint: {
    fontSize: 10,
    color: Colors.gold,
    fontWeight: '500',
    marginTop: 2,
  },
  completedDate: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
  validatedBadge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: Colors.gold + '18',
    borderWidth: 1,
    borderColor: Colors.gold + '50',
    marginTop: 3,
  },
  validatedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.gold,
    letterSpacing: 0.3,
  },
  validateNudge: {
    fontSize: 10,
    color: Colors.primaryLight,
    fontWeight: '600',
    marginTop: 3,
    opacity: 0.8,
  },
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  addBtnText: {
    fontSize: 18,
    fontWeight: '400',
    lineHeight: 22,
  },
  completedBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.success + '25',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.success + '40',
    flexShrink: 0,
  },
  completedBadgeText: {
    fontSize: 13,
    color: Colors.success,
    fontWeight: '700',
  },
});
