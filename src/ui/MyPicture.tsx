import { ACCOUNT_BG_KEY, getOverride, removeOverride, setOverride, useImagesVersion } from '../lib/images';
import { UploadButton } from './controls';

/** Your account-wide background picture ("My picture"): upload, replace, remove. */
export function MyPictureControls() {
  useImagesVersion();
  const mine = getOverride(ACCOUNT_BG_KEY);
  return (
    <div className="my-picture">
      {mine && <img src={mine.src} alt="" className="my-picture-thumb" />}
      <div>
        <div className="row gap wrap">
          <UploadButton className="btn" onImage={(src) => void setOverride({ key: ACCOUNT_BG_KEY, src, zoom: 1, x: 50, y: 50 })}>
            {mine ? 'Replace my picture' : 'Upload my picture'}
          </UploadButton>
          {mine && (
            <button className="btn danger" onClick={() => void removeOverride(ACCOUNT_BG_KEY)}>
              Remove
            </button>
          )}
        </div>
        <p className="muted small">Saved to your account and synced to your devices. Every wrapped using “My picture” updates when you replace it.</p>
      </div>
    </div>
  );
}
