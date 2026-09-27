/**
 * Releases a tracker's camera + detector resources before its reference is
 * dropped. Used on the camera-setup failure path, where getUserMedia can
 * succeed but a later step (e.g. video.play()) fails — nulling the reference
 * without disposing first would leak the open camera stream/model.
 *
 * @param {{ dispose: () => void } | null} tracker
 * @returns {null}
 */
export function disposeCameraTracker(tracker) {
  tracker?.dispose();
  return null;
}
