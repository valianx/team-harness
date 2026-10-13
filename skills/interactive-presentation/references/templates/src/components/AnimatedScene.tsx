import { useCallback, useEffect, useRef, useState } from "react";
import type { AnimatedSceneData, AnimationRegistry, AnimationTimeline, RegisterSceneControls } from "../types";

interface Snapshot {
  ready: boolean;
  playing: boolean;
  progress: number;
  step: number;
  totalSteps: number;
  canNext: boolean;
  canPrevious: boolean;
}

interface Registration {
  timeline: AnimationTimeline;
  times: number[];
  detach: () => void;
}

const empty: Snapshot = {
  ready: false, playing: false, progress: 0, step: 0, totalSteps: 0, canNext: false, canPrevious: false,
};
const epsilon = 0.001;

/** Transport consumes the actual component timeline, preserving its callbacks and disposal. */
export function AnimatedScene({ scene, animations, reducedMotion, registerControls }: {
  scene: AnimatedSceneData;
  animations: AnimationRegistry;
  reducedMotion: boolean;
  registerControls: RegisterSceneControls;
}) {
  const registered = useRef<Registration | null>(null);
  const [snapshot, setSnapshot] = useState(empty);
  const [error, setError] = useState("");
  const Component = animations[scene.component];

  const refresh = useCallback(() => {
    const value = registered.current;
    if (!value) return;
    const time = value.timeline.time();
    const next: Snapshot = {
      ready: true,
      playing: !value.timeline.paused() && value.timeline.progress() < 1,
      progress: Math.round(value.timeline.progress() * 100) / 100,
      step: Math.max(0, value.times.filter((point) => point <= time + epsilon).length - 1),
      totalSteps: value.times.length,
      canNext: value.times.some((point) => point > time + epsilon),
      canPrevious: time > epsilon,
    };
    setSnapshot((previous) => Object.keys(next).every((key) => previous[key as keyof Snapshot] === next[key as keyof Snapshot]) ? previous : next);
  }, []);

  const clear = useCallback(() => {
    registered.current?.detach();
    registered.current = null;
    setSnapshot(empty);
  }, []);
  const reportError = useCallback((message: string) => {
    clear();
    setError(message || "The animation could not be loaded.");
  }, [clear]);

  const registerTimeline = useCallback((timeline: AnimationTimeline, labels?: string[]) => {
    clear();
    const duration = timeline.duration();
    const times = labels ? labels.map((label) => timeline.labels[label]) : [0, duration];
    if (!(duration > 0) || times.length < 2 || times.some((time, index) =>
      !Number.isFinite(time) || (index > 0 && time <= times[index - 1])) ||
      Math.abs(times[0]) > epsilon || Math.abs(times[times.length - 1] - duration) > epsilon) {
      timeline.pause();
      setError("The animation needs a valid start, intermediate states and an ending.");
      return () => timeline.pause();
    }

    const detachCallbacks: (() => void)[] = [];
    const value: Registration = {
      timeline,
      times,
      detach: () => {
        timeline.pause();
        detachCallbacks.forEach((detach) => detach());
      },
    };
    registered.current = value;
    for (const event of ["onUpdate", "onComplete", "onReverseComplete"] as const) {
      const previous = timeline.eventCallback(event);
      const callback = function(this: unknown, ...args: unknown[]) {
        previous?.apply(this, args);
        if (registered.current === value) refresh();
      };
      timeline.eventCallback(event, callback);
      detachCallbacks.push(() => {
        if (timeline.eventCallback(event) === callback) timeline.eventCallback(event, previous ?? null);
      });
    }
    timeline.pause();
    setError("");
    refresh();
    return () => {
      value.detach();
      if (registered.current === value) {
        registered.current = null;
        setSnapshot(empty);
      }
    };
  }, [clear, refresh]);

  const move = useCallback((direction: number) => {
    const value = registered.current;
    if (!value) return false;
    const time = value.timeline.time();
    const target = direction > 0
      ? value.times.find((point) => point > time + epsilon)
      : [...value.times].reverse().find((point) => point < time - epsilon);
    if (target === undefined) return false;
    value.timeline.pause().seek(target, false);
    refresh();
    return true;
  }, [refresh]);
  const togglePlayback = useCallback(() => {
    const timeline = registered.current?.timeline;
    if (!timeline || reducedMotion) return;
    if (!timeline.paused() && timeline.progress() < 1) timeline.pause();
    else if (timeline.progress() >= 1) timeline.restart();
    else timeline.play();
    refresh();
  }, [reducedMotion, refresh]);
  const restart = useCallback(() => {
    registered.current?.timeline.pause().seek(0, false);
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (reducedMotion) {
      registered.current?.timeline.pause();
      refresh();
    }
  }, [reducedMotion, refresh]);

  useEffect(() => {
    registerControls({ ...snapshot, next: () => move(1), previous: () => move(-1),
      animation: { ready: snapshot.ready, playing: snapshot.playing, progress: snapshot.progress, togglePlayback, restart },
    });
  }, [snapshot, move, togglePlayback, restart, registerControls]);
  useEffect(() => () => {
    registered.current?.detach();
    registered.current = null;
    registerControls(null);
  }, [registerControls]);

  const failure = error || (!Component ? "The animation component could not be loaded." : "");
  return <div className="animation-stage" data-animation-status={failure ? "error" : snapshot.ready ? "ready" : "loading"}>
    <div className="animation-component">
      {Component && <Component reducedMotion={reducedMotion} registerTimeline={registerTimeline} reportError={reportError} />}
    </div>
    {failure ? <p className="animation-caption" role="alert">{failure}</p>
      : !snapshot.ready ? <p className="animation-caption" role="status">Animation controls are loading.</p>
      : reducedMotion ? <p className="animation-caption">Reduced motion: use explicit steps to inspect the explanation.</p> : null}
  </div>;
}
