import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAppStore, CAREER_PATHS } from '../store/appStore';
import { useThemeColors, ColorsType, Colors, Spacing, Radius, FontSize, PathColors } from '../utils/theme';
import { CareerPathId, CareerPath, CustomSkill, ExperienceLevel } from '../types';
import { uid } from '../utils/uid';
import { getPathDemandLabel, DEMAND_SOURCE_LABEL } from '../data/marketDemand';
import PrivacyPolicyModal from '../components/PrivacyPolicyModal';
import TermsOfServiceModal from '../components/TermsOfServiceModal';

const ONBOARDING_PATH_CATEGORIES = [
  { label: 'Data & AI', pathIds: ['data-architect', 'data-engineer', 'ai-engineer', 'ml-engineer', 'data-analyst'] },
  { label: 'Engineering', pathIds: ['fullstack', 'backend-engineer', 'frontend-engineer', 'mobile-developer', 'cloud-engineer', 'devops'] },
  { label: 'Security & Architecture', pathIds: ['cybersecurity', 'solutions-architect', 'software-architect'] },
  { label: 'Business & Strategy', pathIds: ['product-manager', 'business-analyst', 'project-manager', 'ui-ux-designer', 'startup-founder'] },
];
import { track } from '../utils/analytics';


export default function OnboardingScreen() {
  const Colors = useThemeColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedPath, setSelectedPath] = useState<CareerPathId | null>(null);
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | null>(null);

  // Custom path state — set when user chooses "Build My Own Path" in step 2
  const [isCustomPath, setIsCustomPath] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  // MED-001: cancel the pending "finish onboarding" timer if the user navigates away
  // (back) or unmounts before it fires, so onboarding can't commit after a back-tap.
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
  }, [step]);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;

  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const addCustomPath = useAppStore((s) => s.addCustomPath);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, tension: 55, friction: 7, useNativeDriver: false }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 700, useNativeDriver: false }),
    ]).start();
    track('onboarding_started');
  }, []);

  // Forward transition: slide out left, come in from right
  const transitionTo = (nextStep: number) => {
    track('onboarding_step_completed', { step: step, next_step: nextStep });
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: false }),
      Animated.timing(slideAnim, { toValue: -24, duration: 180, useNativeDriver: false }),
    ]).start(() => {
      setStep(nextStep);
      slideAnim.setValue(24);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: false }),
        Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: false }),
      ]).start();
    });
  };

  // Back transition: slide out right, come in from left (ISSUE-006)
  const transitionBack = (prevStep: number) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: false }),
      Animated.timing(slideAnim, { toValue: 24, duration: 150, useNativeDriver: false }),
    ]).start(() => {
      setStep(prevStep);
      slideAnim.setValue(-24);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: false }),
        Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: false }),
      ]).start();
    });
  };

  const handleSkipName = () => {
    track('onboarding_step_skipped', { step: 1 });
    transitionTo(2);
  };

  const handleSkipPath = () => {
    track('onboarding_step_skipped', { step: 2 });
    if (!selectedPath) setSelectedPath(CAREER_PATHS[0].id as CareerPathId);
    setIsCustomPath(false);
    transitionTo(3);
  };

  // Finalize onboarding. Called from the final step (experience level for
  // built-in paths, or the custom-path builder). New users are NOT asked to log
  // an output here — they land on the dashboard, which has its own "Log my first
  // output" mission CTA. completeOnboarding grants 25 XP + streak 1 (UX-029) and
  // flips hasOnboarded → the navigator switches to Main automatically.
  const finishOnboarding = (pathId: CareerPathId | string, level?: ExperienceLevel) => {
    const finalName = name.trim() || 'Explorer';
    completeOnboarding(finalName, pathId, email.trim() || undefined, level);
  };

  // Custom path: addCustomPath already ran in the builder; finalize with its id.
  const handleCustomPathCreated = (pathId: string) => {
    finishOnboarding(pathId);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Step dots + back button row (ISSUE-006) */}
        <View style={styles.topRow}>
          {step > 0 ? (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => transitionBack(step - 1)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Go back to previous step"
            >
              <Text style={styles.backBtnText}>‹</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.backBtnPlaceholder} />
          )}

          <View style={styles.stepDots}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === step
                    ? styles.dotActive
                    : i < step
                    ? styles.dotDone
                    : styles.dotIdle,
                ]}
              />
            ))}
          </View>

          {/* Right spacer mirrors the back button so dots are centered */}
          <View style={styles.backBtnPlaceholder} />
        </View>

        <Animated.View
          style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {step === 0 && (
            <WelcomeStep
              logoScale={logoScale}
              logoOpacity={logoOpacity}
              onNext={() => transitionTo(1)}
            />
          )}
          {step === 1 && (
            <NameStep name={name} setName={setName} email={email} setEmail={setEmail} onNext={() => transitionTo(2)} onSkip={handleSkipName} />
          )}
          {step === 2 && (
            <PathStep
              name={name}
              selectedPath={selectedPath}
              isCustomPath={isCustomPath}
              setSelectedPath={(p) => { setSelectedPath(p); setIsCustomPath(false); }}
              onSelectCustom={() => {
                setSelectedPath(null);
                setIsCustomPath(true);
                transitionTo(3);
              }}
              onNext={() => transitionTo(3)}
              onSkip={handleSkipPath}
            />
          )}
          {step === 3 && isCustomPath && (
            <CustomPathBuilderStep
              name={name}
              addCustomPath={addCustomPath}
              onCreated={handleCustomPathCreated}
              onBack={() => transitionBack(2)}
            />
          )}
          {step === 3 && !isCustomPath && (
            <ExperienceLevelStep
              name={name}
              selectedLevel={experienceLevel}
              onSelect={(level) => {
                setExperienceLevel(level);
                track('onboarding_step_completed', { step: 3, next_step: 'complete' });
                // Brief delay so the selection registers visually before we finalize.
                // MED-001: store the timer so a back-tap (step change) cancels it.
                if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
                finishTimerRef.current = setTimeout(() => {
                  finishOnboarding(selectedPath ?? (CAREER_PATHS[0].id as CareerPathId), level);
                }, 320);
              }}
            />
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Welcome-screen artwork (logo + journey staircase + trend glyph) ──────────
// The brand mark is the journey made literal: stacked isometric steps climbing
// toward a glowing summit gem, with a winding path grooved up the treads.
function MaglakbAILogo({ size = 100 }: { size?: number }) {
  return (
    // @ts-ignore — SVG is web-only; valid in react-native-web / Vite target
    <svg width={size} height={size} viewBox="0 0 120 120" style={{ display: 'block', overflow: 'visible' } as any}>
      {/* @ts-ignore */}
      <defs>
        {/* @ts-ignore */}
        <linearGradient id="lgTop" x1="0%" y1="0%" x2="100%" y2="100%">
          {/* @ts-ignore */}<stop offset="0%" stopColor="#5CB4FF" />
          {/* @ts-ignore */}<stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
        {/* @ts-ignore */}
        <linearGradient id="lgLeft" x1="0%" y1="0%" x2="0%" y2="100%">
          {/* @ts-ignore */}<stop offset="0%" stopColor="#1E3A8A" />
          {/* @ts-ignore */}<stop offset="100%" stopColor="#11214F" />
        </linearGradient>
        {/* @ts-ignore */}
        <linearGradient id="lgRight" x1="0%" y1="0%" x2="0%" y2="100%">
          {/* @ts-ignore */}<stop offset="0%" stopColor="#2F6BDD" />
          {/* @ts-ignore */}<stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
        {/* @ts-ignore */}
        <linearGradient id="lgGem" x1="0%" y1="0%" x2="100%" y2="100%">
          {/* @ts-ignore */}<stop offset="0%" stopColor="#A5F3FC" />
          {/* @ts-ignore */}<stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
        {/* @ts-ignore */}
        <filter id="lgGlow" x="-80%" y="-80%" width="260%" height="260%">
          {/* @ts-ignore */}<feGaussianBlur stdDeviation="3" result="b" />
          {/* @ts-ignore */}
          <feMerge>
            {/* @ts-ignore */}<feMergeNode in="b" />
            {/* @ts-ignore */}<feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* one reusable isometric step (top-back corner at origin) */}
        {/* @ts-ignore */}
        <g id="lgStep">
          {/* @ts-ignore */}<polygon points="0,0 24,12 0,24 -24,12" fill="url(#lgTop)" />
          {/* @ts-ignore */}<polygon points="-24,12 0,24 0,42 -24,30" fill="url(#lgLeft)" />
          {/* @ts-ignore */}<polygon points="0,24 24,12 24,30 0,42" fill="url(#lgRight)" />
          {/* @ts-ignore */}<polygon points="0,0 24,12 0,24 -24,12" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="0.75" />
        </g>
      </defs>

      {/* steps drawn back (top-right) → front (bottom-left) */}
      {/* @ts-ignore */}<use href="#lgStep" transform="translate(76,30)" />
      {/* @ts-ignore */}<use href="#lgStep" transform="translate(56,48)" />
      {/* @ts-ignore */}<use href="#lgStep" transform="translate(36,66)" />

      {/* winding path groove up the treads */}
      {/* @ts-ignore */}
      <path d="M32,84 C50,75 48,60 62,53 S80,38 84,30" fill="none" stroke="#070C1A" strokeWidth="5.5" strokeLinecap="round" opacity="0.9" />
      {/* @ts-ignore */}
      <path d="M32,84 C50,75 48,60 62,53 S80,38 84,30" fill="none" stroke="#60A5FA" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />

      {/* summit gem */}
      {/* @ts-ignore */}
      <g filter="url(#lgGlow)">
        {/* @ts-ignore */}<polygon points="86,8 97,19 86,30 75,19" fill="url(#lgGem)" />
        {/* @ts-ignore */}<polygon points="86,8 97,19 86,30 75,19" fill="none" stroke="#CFFAFE" strokeWidth="0.8" />
      </g>
    </svg>
  );
}

// ── The LEARN → APPLY → ACHIEVE → ELEVATE journey staircase ──────────────────
// Four ascending isometric steps, a glowing path climbing to an up-arrow, each
// stage labelled in its own colour with a one-line "what you get" to the right.
function JourneyStaircase() {
  return (
    // @ts-ignore — SVG is web-only; scales to container width via viewBox
    <svg viewBox="0 0 360 300" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' } as any}>
      {/* @ts-ignore */}
      <defs>
        {/* @ts-ignore */}
        <linearGradient id="jTop" x1="0%" y1="0%" x2="0%" y2="100%">
          {/* @ts-ignore */}<stop offset="0%" stopColor="#2C3768" />
          {/* @ts-ignore */}<stop offset="100%" stopColor="#212a54" />
        </linearGradient>
        {/* @ts-ignore */}
        <linearGradient id="jLeft" x1="0%" y1="0%" x2="0%" y2="100%">
          {/* @ts-ignore */}<stop offset="0%" stopColor="#161d40" />
          {/* @ts-ignore */}<stop offset="100%" stopColor="#0e1330" />
        </linearGradient>
        {/* @ts-ignore */}
        <linearGradient id="jRight" x1="0%" y1="0%" x2="0%" y2="100%">
          {/* @ts-ignore */}<stop offset="0%" stopColor="#1d2650" />
          {/* @ts-ignore */}<stop offset="100%" stopColor="#141a3c" />
        </linearGradient>
        {/* @ts-ignore */}
        <linearGradient id="jPath" x1="0%" y1="100%" x2="100%" y2="0%">
          {/* @ts-ignore */}<stop offset="0%" stopColor="#22D3EE" />
          {/* @ts-ignore */}<stop offset="50%" stopColor="#6366F1" />
          {/* @ts-ignore */}<stop offset="100%" stopColor="#E879F9" />
        </linearGradient>
        {/* @ts-ignore */}
        <filter id="jGlow" x="-60%" y="-60%" width="220%" height="220%">
          {/* @ts-ignore */}<feGaussianBlur stdDeviation="2.6" result="b" />
          {/* @ts-ignore */}
          <feMerge>
            {/* @ts-ignore */}<feMergeNode in="b" />
            {/* @ts-ignore */}<feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* one reusable isometric step (top-back corner at origin) */}
        {/* @ts-ignore */}
        <g id="jStep">
          {/* @ts-ignore */}<polygon points="0,0 50,16 0,32 -50,16" fill="url(#jTop)" />
          {/* @ts-ignore */}<polygon points="-50,16 0,32 0,54 -50,38" fill="url(#jLeft)" />
          {/* @ts-ignore */}<polygon points="0,32 50,16 50,38 0,54" fill="url(#jRight)" />
          {/* @ts-ignore */}<polygon points="0,0 50,16 0,32 -50,16" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
        </g>
      </defs>

      {/* steps: ELEVATE (back/top) → LEARN (front/bottom) */}
      {/* @ts-ignore */}<use href="#jStep" transform="translate(175,56)" />
      {/* @ts-ignore */}<use href="#jStep" transform="translate(140,104)" />
      {/* @ts-ignore */}<use href="#jStep" transform="translate(105,152)" />
      {/* @ts-ignore */}<use href="#jStep" transform="translate(70,200)" />

      {/* glowing path climbing the steps + up-arrow at the summit */}
      {/* @ts-ignore */}
      <g filter="url(#jGlow)">
        {/* @ts-ignore */}
        <path d="M70,224 C96,210 92,188 110,176 C128,164 132,142 148,130 C166,118 170,98 178,86 L178,52" fill="none" stroke="url(#jPath)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {/* @ts-ignore */}
        <polyline points="168,64 178,52 188,64" fill="none" stroke="#E879F9" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* ── icons (each centred on its step's top face) ───────────── */}
      {/* LEARN — book (cyan) */}
      {/* @ts-ignore */}
      <g transform="translate(70,216)" filter="url(#jGlow)" stroke="#22D3EE" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* @ts-ignore */}<path d="M-9,-6 C-5,-8 -1,-7 0,-5 L0,7 C-1,5 -5,4 -9,6 Z" />
        {/* @ts-ignore */}<path d="M9,-6 C5,-8 1,-7 0,-5 L0,7 C1,5 5,4 9,6 Z" />
      </g>
      {/* APPLY — check in rounded square (blue) */}
      {/* @ts-ignore */}
      <g transform="translate(105,168)" filter="url(#jGlow)" stroke="#60A5FA" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* @ts-ignore */}<rect x="-9" y="-9" width="18" height="18" rx="5" />
        {/* @ts-ignore */}<polyline points="-5,0 -1,4 6,-5" />
      </g>
      {/* ACHIEVE — trophy (purple) */}
      {/* @ts-ignore */}
      <g transform="translate(140,120)" filter="url(#jGlow)" stroke="#C084FC" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* @ts-ignore */}<path d="M-7,-8 H7 V-3 C7,2 4,5 0,5 C-4,5 -7,2 -7,-3 Z" />
        {/* @ts-ignore */}<path d="M-7,-6 C-11,-6 -11,0 -7,0.5" />
        {/* @ts-ignore */}<path d="M7,-6 C11,-6 11,0 7,0.5" />
        {/* @ts-ignore */}<line x1="0" y1="5" x2="0" y2="8" />
        {/* @ts-ignore */}<line x1="-5" y1="9" x2="5" y2="9" />
      </g>
      {/* ELEVATE — star (magenta) */}
      {/* @ts-ignore */}
      <g transform="translate(175,72)" filter="url(#jGlow)">
        {/* @ts-ignore */}
        <polygon points="0,-9 2.6,-3 9,-2.8 4,1.4 5.6,7.6 0,4.2 -5.6,7.6 -4,1.4 -9,-2.8 -2.6,-3" fill="none" stroke="#F0ABFC" strokeWidth="2.2" strokeLinejoin="round" />
      </g>

      {/* ── stage labels (on each step's front face) ──────────────── */}
      {/* @ts-ignore */}<text x="70" y="240" textAnchor="middle" fill="#22D3EE" fontSize="12.5" fontWeight="800" letterSpacing="1.5">LEARN</text>
      {/* @ts-ignore */}<text x="105" y="192" textAnchor="middle" fill="#60A5FA" fontSize="12.5" fontWeight="800" letterSpacing="1.5">APPLY</text>
      {/* @ts-ignore */}<text x="140" y="144" textAnchor="middle" fill="#C084FC" fontSize="12.5" fontWeight="800" letterSpacing="1.5">ACHIEVE</text>
      {/* @ts-ignore */}<text x="175" y="96" textAnchor="middle" fill="#F0ABFC" fontSize="12.5" fontWeight="800" letterSpacing="1.5">ELEVATE</text>

      {/* ── right-column descriptions — each aligned to its step's label ─── */}
      {/* LEARN ↔ "Gain skills" (label baseline y=240) */}
      {/* @ts-ignore */}<line x1="238" y1="229" x2="238" y2="251" stroke="#22D3EE" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
      {/* @ts-ignore */}
      <text x="250" fontSize="12">
        {/* @ts-ignore */}<tspan x="250" y="236" fill="#D7DAEC" fontWeight="600">Gain skills</tspan>
        {/* @ts-ignore */}<tspan x="250" y="251" fill="#8A8FB0" fontWeight="500">that matter.</tspan>
      </text>

      {/* APPLY ↔ "Use skills in" (label baseline y=192) */}
      {/* @ts-ignore */}<line x1="238" y1="181" x2="238" y2="203" stroke="#60A5FA" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
      {/* @ts-ignore */}
      <text x="250" fontSize="12">
        {/* @ts-ignore */}<tspan x="250" y="188" fill="#D7DAEC" fontWeight="600">Use skills in</tspan>
        {/* @ts-ignore */}<tspan x="250" y="203" fill="#8A8FB0" fontWeight="500">real situations.</tspan>
      </text>

      {/* ACHIEVE ↔ "Build proof." (label baseline y=144) */}
      {/* @ts-ignore */}<line x1="238" y1="133" x2="238" y2="155" stroke="#C084FC" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
      {/* @ts-ignore */}
      <text x="250" fontSize="12">
        {/* @ts-ignore */}<tspan x="250" y="140" fill="#D7DAEC" fontWeight="600">Build proof.</tspan>
        {/* @ts-ignore */}<tspan x="250" y="155" fill="#8A8FB0" fontWeight="500">Create impact.</tspan>
      </text>

      {/* ELEVATE ↔ "Unlock new" (label baseline y=96) */}
      {/* @ts-ignore */}<line x1="238" y1="85" x2="238" y2="107" stroke="#F0ABFC" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
      {/* @ts-ignore */}
      <text x="250" fontSize="12">
        {/* @ts-ignore */}<tspan x="250" y="92" fill="#D7DAEC" fontWeight="600">Unlock new</tspan>
        {/* @ts-ignore */}<tspan x="250" y="107" fill="#8A8FB0" fontWeight="500">opportunities.</tspan>
      </text>
    </svg>
  );
}

// Up-trend chart glyph for the "Show results." card.
function TrendIcon({ size = 34 }: { size?: number }) {
  return (
    // @ts-ignore — SVG is web-only
    <svg width={size} height={size} viewBox="0 0 36 36" style={{ display: 'block' } as any}>
      {/* @ts-ignore */}
      <defs>
        {/* @ts-ignore */}
        <linearGradient id="trGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          {/* @ts-ignore */}<stop offset="0%" stopColor="#60A5FA" />
          {/* @ts-ignore */}<stop offset="100%" stopColor="#C084FC" />
        </linearGradient>
      </defs>
      {/* @ts-ignore */}
      <polyline points="4,26 13,18 19,22 30,9" fill="none" stroke="url(#trGrad)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      {/* @ts-ignore */}<polyline points="23,9 30,9 30,16" fill="none" stroke="url(#trGrad)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Welcome Screen v2 ────────────────────────────────────────────────────────
// Design philosophy: Headspace / Spotify clarity — one dominant visual,
// one headline, one supporting line, one CTA. No competing elements.
//
// Reading order (5 elements only):
//   Icon → Brand → Tagline (2-line bilingual) → Value prop → CTA
//
// Brand positioning (v3):
//   MaglakbAI is NOT a learning app. NOT an AI app.
//   It is the platform where people build VISIBLE PROOF of their growth
//   through real outputs, earned achievements, and community recognition.
//   Roadmaps, AI, and market signals are supporting features — not the story.
//
// Core identity delivered in 4 lines:
//   Navigate Your Future.           ← where you're headed (aspiration)
//   Isulong Ang Pangarap.           ← the heart (Filipino soul)
//   Stop talking.                   ← the problem (what NOT to do)
//   Show results.                   ← the solution (what MaglakbAI is)
//
// "Show results." is the line that makes people immediately
// understand what MaglakbAI could become. It earns its own visual weight.
function WelcomeStep({
  logoScale,
  logoOpacity,
  onNext,
}: {
  logoScale: Animated.Value;
  logoOpacity: Animated.Value;
  onNext: () => void;
}) {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  // Single-screen, no scroll: a flex column that distributes to fill the space.
  return (
    <View style={styles.welcomeFit}>
      {/* Brand cluster — mark, wordmark, tagline */}
      <View style={styles.brandCluster}>
        <Animated.View
          style={[
            styles.logoWrap,
            { opacity: logoOpacity, transform: [{ scale: logoScale }] },
          ]}
        >
          <MaglakbAILogo size={92} />
        </Animated.View>
        <Text style={styles.wordmarkRow} nativeID="brand-wordmark">
          <Text style={styles.wordmarkWhite}>Maglakb</Text>
          <Text style={styles.wordmarkAI}>AI</Text>
        </Text>
        <View style={styles.brandDivider} />
        <Text style={styles.taglineFil}>Isulong ang pangarap.</Text>
      </View>

      {/* Glass card: the contrast statement + scope + trend glyph */}
      <View style={styles.glassCard}>
        <View style={styles.glassCardLeft}>
          <Text style={styles.cardStopTalking}>Stop talking.</Text>
          <Text style={styles.cardShowResults}>
            Show <Text style={styles.cardResultsAccent}>results.</Text>
          </Text>
          <Text style={styles.cardScope}>ANY SKILL. ANY FIELD. ANY LEVEL.</Text>
        </View>
        <View style={styles.trendChip}>
          <TrendIcon size={34} />
        </View>
      </View>

      {/* The LEARN → APPLY → ACHIEVE → ELEVATE journey */}
      <View style={styles.journeyWrap}>
        <JourneyStaircase />
      </View>

      {/* CTA */}
      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={onNext}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Start building and showing results with MaglakbAI"
      >
        <Text style={styles.primaryBtnText}>Start Building Now  →</Text>
      </TouchableOpacity>
    </View>
  );
}

function NameStep({
  name,
  setName,
  email,
  setEmail,
  onNext,
  onSkip,
}: {
  name: string;
  setName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  const emailRef = useRef<any>(null);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  // MED-002: validate the (optional) email before advancing, so a malformed address is
  // caught here rather than silently at Magic Link time after onboarding completes.
  const [emailError, setEmailError] = useState(false);
  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
  const handleContinue = () => {
    if (!name.trim()) return;
    if (email.trim() && !isValidEmail(email)) { setEmailError(true); return; }
    setEmailError(false);
    onNext();
  };
  return (
    <ScrollView contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepEmoji}>👤</Text>
      <Text style={styles.stepTitle}>Create your identity.</Text>
      <Text style={styles.stepSub}>
        Your name is your public handle. Your email is for progress updates — never shared.
      </Text>

      <TextInput
        style={styles.textInput}
        placeholder="Your name or handle"
        placeholderTextColor={Colors.textMuted}
        value={name}
        onChangeText={setName}
        autoFocus
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
      />

      <TextInput
        ref={emailRef}
        style={styles.textInput}
        placeholder="Email (optional — for progress updates)"
        placeholderTextColor={Colors.textMuted}
        value={email}
        onChangeText={(v) => { setEmail(v); if (emailError) setEmailError(false); }}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={handleContinue}
      />
      {emailError ? (
        <Text style={{ color: Colors.danger, fontSize: FontSize.sm, marginTop: 4 }}>
          Enter a valid email address, or leave it blank.
        </Text>
      ) : (
        <Text style={styles.inputHint}>
          e.g. "Juan Masipag" — the community will know you by this.
        </Text>
      )}

      <TouchableOpacity
        style={[styles.primaryBtn, !name.trim() && styles.btnDisabled]}
        onPress={handleContinue}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryBtnText}>Continue →</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.skipLink} onPress={onSkip} activeOpacity={0.7}>
        <Text style={styles.skipLinkText}>Skip for now — I'll set this up later</Text>
      </TouchableOpacity>

      {/* COMP-001: Terms + Privacy reachable before any sign-up / email use */}
      <Text style={styles.legalNote}>
        By continuing, you agree to our{' '}
        <Text style={styles.legalLink} onPress={() => setShowTerms(true)}>Terms of Service</Text>
        {' '}and{' '}
        <Text style={styles.legalLink} onPress={() => setShowPrivacy(true)}>Privacy Policy</Text>.
      </Text>

      <TermsOfServiceModal visible={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyPolicyModal visible={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </ScrollView>
  );
}

function PathStep({
  name,
  selectedPath,
  isCustomPath,
  setSelectedPath,
  onSelectCustom,
  onNext,
  onSkip,
}: {
  name: string;
  selectedPath: CareerPathId | null;
  isCustomPath: boolean;
  setSelectedPath: (p: CareerPathId) => void;
  onSelectCustom: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  const btnOpacity = useRef(new Animated.Value(0)).current;
  const btnTranslate = useRef(new Animated.Value(24)).current;

  // Animate the sticky button in when a path is first selected
  const hasSelection = !!(selectedPath || isCustomPath);
  React.useEffect(() => {
    if (hasSelection) {
      Animated.parallel([
        Animated.timing(btnOpacity, { toValue: 1, duration: 250, useNativeDriver: false }),
        Animated.timing(btnTranslate, { toValue: 0, duration: 250, useNativeDriver: false }),
      ]).start();
    }
  }, [hasSelection]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={styles.pathScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.stepTitle}>
          Choose your path{name ? `, ${name.split(' ')[0]}` : ''}.
        </Text>
        <Text style={styles.stepSub}>
          This becomes your Priority Roadmap. Focused mastery — one path at a time.
        </Text>

        {/* ── Build My Own Path ──────────────────────────────── */}
        <TouchableOpacity
          style={[styles.customPathCard, isCustomPath && styles.customPathCardSelected]}
          onPress={onSelectCustom}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Build my own path"
        >
          <Text style={styles.customPathCardEmoji}>✨</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.customPathCardTitle, isCustomPath && { color: Colors.primaryLight }]}>
              Build My Own Path
            </Text>
            <Text style={styles.customPathCardSub}>
              Not in tech? Define your own skills and milestones — any field, any goal.
            </Text>
          </View>
          {isCustomPath && (
            <View style={styles.selectedBadge}>
              <Text style={styles.selectedBadgeText}>✓</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* ── Tech career paths ─────────────────────────────── */}
        {ONBOARDING_PATH_CATEGORIES.map((cat) => (
          <View key={cat.label}>
            <Text style={styles.catLabel}>{cat.label.toUpperCase()}</Text>
            <View style={styles.pathCards}>
              {cat.pathIds.map((pid) => {
                const path = CAREER_PATHS.find((p) => p.id === pid);
                if (!path) return null;
                return (
                  <PathCard
                    key={path.id}
                    path={path}
                    selected={!isCustomPath && selectedPath === path.id}
                    onSelect={() => setSelectedPath(path.id as CareerPathId)}
                  />
                );
              })}
            </View>
          </View>
        ))}

        {/* Skip option */}
        <TouchableOpacity style={[styles.skipLink, { marginTop: Spacing.lg }]} onPress={onSkip} activeOpacity={0.7}>
          <Text style={styles.skipLinkText}>Skip — start with Data Architect path</Text>
        </TouchableOpacity>

        {/* Bottom padding so content isn't hidden behind sticky button */}
        <View style={{ height: 96 }} />
      </ScrollView>

      {/* Sticky CTA — always visible once a path is selected */}
      <Animated.View
        style={[
          styles.stickyFooter,
          { opacity: btnOpacity, transform: [{ translateY: btnTranslate }] },
        ]}
        pointerEvents={hasSelection ? 'auto' : 'none'}
      >
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={isCustomPath ? onSelectCustom : onNext}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>
            {isCustomPath ? 'Build My Path ✨' : 'Begin My Evolution ⚡'}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

function PathCard({
  path,
  selected,
  onSelect,
}: {
  path: CareerPath;
  selected: boolean;
  onSelect: () => void;
}) {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  const pathColor = PathColors[path.id] ?? { primary: path.color, dim: path.color + '15', text: path.textColor, border: path.color + '40' };
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const { label: demandLabel, sentiment } = getPathDemandLabel(path.id);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.97, duration: 70, useNativeDriver: false }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 110, useNativeDriver: false }),
    ]).start();
    onSelect();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          styles.pathCard,
          selected && {
            borderColor: pathColor.primary,
            backgroundColor: pathColor.dim,
            // @ts-ignore
            boxShadow: `0 0 18px ${pathColor.primary}30`,
          },
        ]}
        onPress={handlePress}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={`${path.name}${selected ? ', selected' : ''}${demandLabel ? `. ${demandLabel}` : ''}`}
        accessibilityState={{ selected }}
      >
        {selected && (
          <View style={[styles.selectedBadge, { backgroundColor: pathColor.primary }]}>
            <Text style={styles.selectedBadgeText}>✓ SELECTED</Text>
          </View>
        )}

        <View style={styles.pathCardHeader}>
          <Text style={styles.pathCardIcon}>{path.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pathCardName, selected && { color: pathColor.text }]}>
              {path.name}
            </Text>
            <Text style={styles.pathCardTitle} numberOfLines={1}>{path.description}</Text>
          </View>
        </View>

        {demandLabel ? (
          <View style={styles.pathCardDemandBlock}>
            <Text style={[
              styles.pathCardDemand,
              sentiment === 'growing' && { color: '#FCD34D' },
            ]}>
              {demandLabel}
            </Text>
            <Text style={styles.pathCardDemandSource}>
              Based on {DEMAND_SOURCE_LABEL}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </Animated.View>
  );
}

const EXPERIENCE_OPTIONS: Array<{
  level: ExperienceLevel;
  icon: string;
  title: string;
  subtitle: string;
  credit: string;
}> = [
  {
    level: 'beginner',
    icon: '🌱',
    title: 'Fresh Start',
    subtitle: 'Just beginning this path.',
    credit: 'Start from skill 1 — log proof to unlock the next.',
  },
  {
    level: 'building',
    icon: '⚡',
    title: 'Some Foundation',
    subtitle: 'I know the basics already.',
    credit: 'Test out of the basics with a quick quiz — or log proof to build.',
  },
  {
    level: 'experienced',
    icon: '🏆',
    title: 'Bringing Experience',
    subtitle: 'I\'ve done most of this before.',
    credit: 'First 3 skills open to test out — pass the quiz to prove it.',
  },
];

function ExperienceLevelStep({
  name,
  selectedLevel,
  onSelect,
}: {
  name: string;
  selectedLevel: ExperienceLevel | null;
  onSelect: (level: ExperienceLevel) => void;
}) {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);

  return (
    <ScrollView contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepEmoji}>🧭</Text>
      <Text style={styles.stepTitle}>
        Where are you starting from{name ? `, ${name.split(' ')[0]}` : ''}?
      </Text>
      <Text style={styles.stepSub}>
        MaglakbAI adapts your roadmap to your level. No wasted steps.
      </Text>

      <View style={styles.expCards}>
        {EXPERIENCE_OPTIONS.map((opt) => {
          const isSelected = selectedLevel === opt.level;
          return (
            <TouchableOpacity
              key={opt.level}
              style={[
                styles.expCard,
                isSelected && styles.expCardSelected,
              ]}
              onPress={() => onSelect(opt.level)}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={`${opt.title} — ${opt.subtitle}`}
              accessibilityState={{ selected: isSelected }}
            >
              <View style={styles.expCardLeft}>
                <Text style={styles.expCardIcon}>{opt.icon}</Text>
              </View>
              <View style={styles.expCardBody}>
                <Text style={[styles.expCardTitle, isSelected && { color: Colors.primaryLight }]}>
                  {opt.title}
                </Text>
                <Text style={styles.expCardSub}>{opt.subtitle}</Text>
                <Text style={[styles.expCardCredit, isSelected && { color: Colors.primaryLight, opacity: 0.85 }]}>
                  ↗ {opt.credit}
                </Text>
              </View>
              {isSelected && (
                <View style={styles.expCardCheck}>
                  <Text style={styles.expCardCheckText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.expHint}>Tap to select — you'll move on automatically.</Text>
    </ScrollView>
  );
}

// ── Custom path icon → color mapping ─────────────────────────────────────────
const CUSTOM_PATH_ICONS = ['🎯', '🎨', '🧠', '💼', '🌿', '🏋️', '🎭', '🔧', '🌐', '🎵'];
const ICON_COLORS: Record<string, string> = {
  '🎯': '#7C3AED',
  '🎨': '#EC4899',
  '🧠': '#3B82F6',
  '💼': '#F59E0B',
  '🌿': '#10B981',
  '🏋️': '#EF4444',
  '🎭': '#8B5CF6',
  '🔧': '#6B7280',
  '🌐': '#06B6D4',
  '🎵': '#14B8A6',
};

function CustomPathBuilderStep({
  name,
  addCustomPath,
  onCreated,
  onBack,
}: {
  name: string;
  addCustomPath: (path: { name: string; icon: string; description: string; color: string; skills: CustomSkill[] }) => string;
  onCreated: (pathId: string) => void;
  onBack: () => void;
}) {
  const Colors = useThemeColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);

  const [pathName, setPathName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('🎯');
  const [skillInputs, setSkillInputs] = useState<string[]>(['', '', '']);

  const validSkillCount = skillInputs.filter((s) => s.trim().length > 0).length;
  const canCreate = pathName.trim().length > 0 && validSkillCount >= 1;

  const updateSkill = (i: number, val: string) =>
    setSkillInputs((prev) => prev.map((s, idx) => (idx === i ? val : s)));
  const addSkillRow = () => {
    if (skillInputs.length < 6) setSkillInputs((prev) => [...prev, '']);
  };
  const removeSkillRow = (i: number) => {
    if (skillInputs.length <= 1) return;
    setSkillInputs((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleCreate = () => {
    if (!canCreate) return;
    const trimmedSkills = skillInputs
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    // Temporary IDs — addCustomPath will store these as-is. MED-003: use a UUID so two
    // skills created in the same millisecond can't collide (which would overwrite
    // userSkills progress); fall back to a random suffix where randomUUID is unavailable.
    const skillObjects: CustomSkill[] = trimmedSkills.map((s, i) => ({
      id: uid('__skill'),
      name: s,
      description: '',
      icon: selectedIcon,
    }));
    const color = ICON_COLORS[selectedIcon] ?? '#7C3AED';
    const newPathId = addCustomPath({
      name: pathName.trim(),
      icon: selectedIcon,
      description: '',
      color,
      skills: skillObjects,
    });
    onCreated(newPathId);
  };

  const accentColor = ICON_COLORS[selectedIcon] ?? Colors.primary;

  return (
    <ScrollView
      contentContainerStyle={[styles.stepContainer, { paddingTop: 24 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.stepEmoji}>✨</Text>
      <Text style={styles.stepTitle}>
        Build your own path{name ? `, ${name.split(' ')[0]}` : ''}.
      </Text>
      <Text style={styles.stepSub}>
        Name your journey and define the milestones. Any field, any goal.
      </Text>

      {/* Path name */}
      <View style={styles.builderSection}>
        <Text style={styles.builderLabel}>PATH NAME</Text>
        <TextInput
          style={[styles.textInput, { borderColor: pathName.trim() ? accentColor + '70' : Colors.border }]}
          placeholder="e.g. Yoga Instructor, Sales Leader, Artist…"
          placeholderTextColor={Colors.textMuted}
          value={pathName}
          onChangeText={setPathName}
          autoFocus
          returnKeyType="next"
          maxLength={40}
        />
      </View>

      {/* Icon picker */}
      <View style={styles.builderSection}>
        <Text style={styles.builderLabel}>PATH ICON</Text>
        <View style={styles.iconPickerRow}>
          {CUSTOM_PATH_ICONS.map((icon) => (
            <TouchableOpacity
              key={icon}
              style={[
                styles.iconPickerBtn,
                selectedIcon === icon && {
                  borderColor: ICON_COLORS[icon] ?? Colors.primary,
                  backgroundColor: (ICON_COLORS[icon] ?? Colors.primary) + '20',
                },
              ]}
              onPress={() => setSelectedIcon(icon)}
              activeOpacity={0.75}
            >
              <Text style={styles.iconPickerEmoji}>{icon}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Skills / milestones */}
      <View style={styles.builderSection}>
        <Text style={styles.builderLabel}>MILESTONES</Text>
        <Text style={styles.builderHint}>
          What skills do you want to master? Add 1–6 milestones.
        </Text>
        <View style={styles.skillInputList}>
          {skillInputs.map((val, i) => (
            <View key={i} style={styles.skillInputRow}>
              <View
                style={[
                  styles.skillInputNum,
                  val.trim() && { backgroundColor: accentColor + '25', borderColor: accentColor + '60' },
                ]}
              >
                <Text style={[styles.skillInputNumText, val.trim() && { color: accentColor }]}>
                  {i + 1}
                </Text>
              </View>
              <TextInput
                style={[
                  styles.skillInput,
                  val.trim() && { borderColor: accentColor + '60' },
                ]}
                placeholder={`Milestone ${i + 1}${i === 0 ? ' (required)' : ''}`}
                placeholderTextColor={Colors.textMuted}
                value={val}
                onChangeText={(v) => updateSkill(i, v)}
                returnKeyType="next"
                maxLength={50}
              />
              {skillInputs.length > 1 && (
                <TouchableOpacity
                  style={styles.skillRemoveBtn}
                  onPress={() => removeSkillRow(i)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.skillRemoveBtnText}>×</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {skillInputs.length < 6 && (
          <TouchableOpacity
            style={styles.addSkillBtn}
            onPress={addSkillRow}
            activeOpacity={0.7}
          >
            <Text style={[styles.addSkillBtnText, { color: accentColor }]}>+ Add milestone</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Create button */}
      <TouchableOpacity
        style={[
          styles.primaryBtn,
          { backgroundColor: accentColor, marginTop: Spacing.xl },
          !canCreate && styles.btnDisabled,
        ]}
        onPress={handleCreate}
        activeOpacity={0.85}
        disabled={!canCreate}
      >
        <Text style={styles.primaryBtnText}>Create My Path →</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.skipLink} onPress={onBack} activeOpacity={0.7}>
        <Text style={styles.skipLinkText}>← Back to path selection</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (Colors: ColorsType) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  // ISSUE-006: top row contains back button + step dots + spacer
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: 16,
    paddingBottom: 6,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 22,
    color: Colors.text,
    lineHeight: 28,
    fontWeight: '300',
  },
  backBtnPlaceholder: {
    width: 34,
    height: 34,
  },
  stepDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    height: 5,
    borderRadius: 3,
  },
  dotIdle: {
    width: 5,
    backgroundColor: Colors.textMuted,
  },
  dotActive: {
    width: 22,
    backgroundColor: Colors.primaryLight,
  },
  dotDone: {
    width: 5,
    backgroundColor: Colors.success,
  },
  content: {
    flex: 1,
  },
  stepContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xxl,
    minHeight: '100%' as any,
  },
  pathScrollContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
  },

  // ── Icon ─────────────────────────────────────────────────────────────────
  // Larger wrapper (120px) — the icon is the hero, not a small badge
  logoWrapper: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    // @ts-ignore — layered glow: tight blue core + soft purple bloom for depth
    filter: 'drop-shadow(0 8px 20px rgba(0,110,210,0.40)) drop-shadow(0 18px 48px rgba(124,58,237,0.30))',
  },

  // ── Brand name ───────────────────────────────────────────────────────────
  // The signature gradient (purple→indigo) — appears exactly twice on this
  // screen: here and on the CTA. It bookends the composition, framing the
  // crisp white messaging between. One gradient family = visual cohesion.
  brandName: {
    fontSize: 40,
    fontWeight: '800' as const,
    color: Colors.primaryLight, // native fallback (gradient is web-only)
    letterSpacing: 0.5,
    marginBottom: 14,
    // @ts-ignore — web-only gradient text
    backgroundImage: 'linear-gradient(135deg, #C084FC 0%, #A855F7 48%, #6366F1 100%)',
    // @ts-ignore
    WebkitBackgroundClip: 'text',
    // @ts-ignore
    backgroundClip: 'text',
    // @ts-ignore
    WebkitTextFillColor: 'transparent',
  },

  // ── Tagline — two-line bilingual with SIZE CONTRAST ──────────────────────
  // English primary: bold, 24px → carries the aspiration
  // Filipino sub: italic, 17px → carries the heart
  // The 7px size gap creates hierarchy without needing any other decoration
  brandTaglinePrimary: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 32,
    letterSpacing: 0.2,
    marginBottom: 5,
  },
  brandTaglineSub: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: Colors.textSub,
    textAlign: 'center',
    fontStyle: 'italic',
    letterSpacing: 0.2,
    marginBottom: 28,
  },

  // ── Core identity manifesto ───────────────────────────────────────────────
  // Two-line contrast statement — the heart of MaglakbAI's positioning.
  // This replaces any "AI/learning" value prop. MaglakbAI is not a learning app.
  // It is the place where growth becomes VISIBLE through proof.
  //
  // Line 1 (manifestoOld): the behaviour being left behind — quieter.
  //   • Smaller (17px), textMuted weight, normal weight
  //   • Reads fast, sets up the contrast
  // Line 2 (manifestoNew): the new identity — owns the visual space.
  //   • Larger (26px), bold, primaryLight colour
  //   • The line users remember after closing the app
  manifesto: {
    alignItems: 'center' as const,
    marginBottom: 28,
    gap: 4,
  },
  // "Stop talking." — the behaviour being left behind. Quiet, recessive.
  manifestoOld: {
    fontSize: 16,
    fontWeight: '400' as const,
    color: Colors.textMuted,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  // "Show results." — the punchline. Crisp white, large, confident.
  // Stays chromatically neutral so the purple gradient bookends (brand + CTA)
  // own the colour story without a third accent competing.
  manifestoNew: {
    fontSize: 30,
    fontWeight: '800' as const,
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: 0.2,
    lineHeight: 36,
  },

  // ── Scope line (retained) ─────────────────────────────────────────────────
  // Quiet engraved caption — tight tracking, muted, sits as a fine print
  // qualifier beneath the punchline.
  forEveryoneLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '700' as const,
    letterSpacing: 2.4,
    textAlign: 'center',
    textTransform: 'uppercase' as const,
  },

  // ── Removed from welcome screen (moved inside app) ───────────────────────
  // socialProofRow, socialProofItem, socialProofDot:
  //   → moved to dashboard/feed where user has context to appreciate the data
  // outcomeChips, outcomeChip, outcomeChipEmoji, outcomeChipLabel:
  //   → onboarding path-selection step communicates this more effectively
  // philosophyLine:
  //   → the CTA "Start Building →" already carries this message; repetition dilutes

  // ══ Welcome screen v4 (mockup rebuild — single screen, no scroll) ════════════
  welcomeFit: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 12,
  },
  brandCluster: {
    alignItems: 'center',
  },
  logoWrap: {
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    // @ts-ignore — blue core glow + cyan bloom, matching the mark
    filter: 'drop-shadow(0 10px 26px rgba(37,99,235,0.42)) drop-shadow(0 4px 16px rgba(34,211,238,0.28))',
  },
  // Wordmark — "Maglakb" white, "AI" blue gradient
  wordmarkRow: {
    fontSize: 38,
    fontWeight: '700' as const, // Space Grotesk's heaviest weight — avoids faux-bold
    letterSpacing: 0.3,
    textAlign: 'center',
    marginBottom: 12,
  },
  wordmarkWhite: { color: Colors.text },
  wordmarkAI: {
    color: '#3B82F6', // native fallback
    // @ts-ignore — web-only gradient text
    backgroundImage: 'linear-gradient(135deg, #38BDF8 0%, #3B82F6 100%)',
    // @ts-ignore
    WebkitBackgroundClip: 'text',
    // @ts-ignore
    backgroundClip: 'text',
    // @ts-ignore
    WebkitTextFillColor: 'transparent',
  },
  brandDivider: {
    width: 34,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.primaryLight,
    opacity: 0.65,
    marginBottom: 16,
  },
  taglineFil: {
    fontSize: 13,
    color: Colors.textSub,
    letterSpacing: 2.6,
    fontWeight: '500' as const,
  },
  // Glass "Show results." card
  glassCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingVertical: 16,
    paddingHorizontal: 20,
    // @ts-ignore — frosted glass + inner top highlight
    backdropFilter: 'blur(8px)',
    // @ts-ignore
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)',
  },
  glassCardLeft: { flex: 1, paddingRight: 10 },
  cardStopTalking: {
    fontSize: 15,
    color: Colors.textSub,
    fontWeight: '500' as const,
    marginBottom: 2,
  },
  cardShowResults: {
    fontSize: 26,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 9,
    letterSpacing: 0.2,
  },
  cardResultsAccent: { color: Colors.primaryLight },
  cardScope: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.textMuted,
    letterSpacing: 1.8,
  },
  trendChip: {
    width: 58,
    height: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(124,58,237,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.38)',
    // @ts-ignore — soft purple glow
    boxShadow: '0 0 18px rgba(124,58,237,0.32)',
  },
  // Journey staircase wrapper — aspectRatio reserves height for the 360×300 svg
  journeyWrap: {
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
    aspectRatio: 1.2,
  },

  // Primary button
  primaryBtn: {
    borderRadius: Radius.full,
    paddingVertical: 17,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    width: '100%',
    // @ts-ignore - web-only gradient (signature: matches brand name)
    backgroundImage: 'linear-gradient(135deg, #A855F7 0%, #7C3AED 50%, #4F46E5 100%)',
    backgroundColor: Colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    // @ts-ignore — grounded shadow + soft colour bloom for a lifted, premium feel
    boxShadow: '0 8px 24px rgba(124,58,237,0.42), inset 0 1px 0 rgba(255,255,255,0.18)',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
    shadowOpacity: 0.45,
    elevation: 6,
  },
  btnDisabled: {
    opacity: 0.35,
  },
  submitHint: {
    textAlign: 'center',
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 8,
  },
  primaryBtnText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.white,
    letterSpacing: 0.5,
  },

  // Step common
  stepEmoji: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  stepTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  stepSub: {
    fontSize: FontSize.base,
    color: Colors.textSub,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  textInput: {
    width: '100%',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 16,
    fontSize: FontSize.md,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  inputHint: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 18,
  },

  // Path cards
  catLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 2.5,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  pathCards: {
    gap: Spacing.sm,
  },
  pathCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    position: 'relative',
  },
  selectedBadge: {
    position: 'absolute',
    top: -1,
    right: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomLeftRadius: Radius.sm,
    borderBottomRightRadius: Radius.sm,
  },
  selectedBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.white,
    letterSpacing: 1,
  },
  pathCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: Spacing.sm,
  },
  pathCardIcon: {
    fontSize: 34,
  },
  pathCardName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  pathCardTitle: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: 1,
  },
  pathCardDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSub,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  pathCardDemandBlock: {
    marginTop: 6,
    gap: 2,
  },
  pathCardDemand: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FCA5A5',          // warm red — matches DemandBadge high colour
    letterSpacing: 0.2,
  },
  pathCardDemandSource: {
    fontSize: 9,
    fontWeight: '400',
    color: Colors.textMuted,
    letterSpacing: 0.1,
  },
  pathSkillList: {
    gap: 3,
  },
  pathSkillItem: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  pathSkillMore: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: 'env(safe-area-inset-bottom, 16px)' as any,
    // @ts-ignore - web-only gradient
    backgroundImage: `linear-gradient(to top, ${Colors.bg} 70%, transparent)`,
    backgroundColor: 'transparent',
  },

  // FirstOutputStep styles
  outputTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: Spacing.md,
    width: '100%',
  },
  outputTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  outputTypeChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '20',
  },
  outputTypeIcon: { fontSize: 14 },
  outputTypeLabel: { fontSize: FontSize.sm, color: Colors.textSub, fontWeight: '500' },
  outputTypeLabelActive: { color: Colors.primaryLight, fontWeight: '700' },
  textInputMulti: {
    height: 80,
    paddingTop: 14,
  },
  skipLink: {
    marginTop: Spacing.md,
    paddingVertical: 8,
  },
  skipLinkText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  legalNote: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  legalLink: {
    color: Colors.primaryLight,
    textDecorationLine: 'underline',
  },

  // ExperienceLevelStep
  expCards: {
    width: '100%',
    gap: 10,
    marginBottom: Spacing.md,
  },
  expCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    padding: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  expCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '14',
    // @ts-ignore
    boxShadow: '0 0 18px rgba(124,58,237,0.25)',
  },
  expCardLeft: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardAlt,
    flexShrink: 0,
  },
  expCardIcon: {
    fontSize: 24,
  },
  expCardBody: {
    flex: 1,
    gap: 2,
  },
  expCardTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
  },
  expCardSub: {
    fontSize: FontSize.sm,
    color: Colors.textSub,
  },
  expCardCredit: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  expCardCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  expCardCheckText: {
    fontSize: 13,
    color: Colors.white,
    fontWeight: '700',
  },
  expHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: Spacing.sm,
  },

  // ── PathStep: "Build My Own Path" card ──────────────────────────────────────
  customPathCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
    position: 'relative',
  },
  customPathCardSelected: {
    borderColor: Colors.primaryLight,
    backgroundColor: Colors.primary + '14',
    // @ts-ignore
    boxShadow: '0 0 18px rgba(124,58,237,0.25)',
  },
  customPathCardEmoji: {
    fontSize: 30,
    flexShrink: 0,
  },
  customPathCardTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  customPathCardSub: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    lineHeight: 18,
  },

  // ── CustomPathBuilderStep styles ─────────────────────────────────────────────
  builderSection: {
    width: '100%',
    marginBottom: Spacing.lg,
  },
  builderLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  builderHint: {
    fontSize: FontSize.sm,
    color: Colors.textSub,
    marginBottom: Spacing.sm,
    lineHeight: 18,
  },
  iconPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconPickerBtn: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPickerEmoji: {
    fontSize: 22,
  },
  skillInputList: {
    gap: 8,
  },
  skillInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  skillInputNum: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  skillInputNumText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  skillInput: {
    flex: 1,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: FontSize.base,
    color: Colors.text,
  },
  skillRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  skillRemoveBtnText: {
    fontSize: 18,
    color: Colors.textMuted,
    lineHeight: 22,
    fontWeight: '400',
  },
  addSkillBtn: {
    marginTop: Spacing.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addSkillBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
