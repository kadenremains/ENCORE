import { ACCOUNT_BG_KEY, getOverride, removeOverride, reportBroken, setOverride, useImagesVersion, useWorkingPicture } from '../lib/images';
import { UploadButton } from './controls';

/** Your account-wide background picture ("My picture"): upload, replace, remove. */
export function MyPictureControls() {
  useImagesVersion();
  const mine = getOverride(ACCOUNT_BG_KEY);
  const thumb = useWorkingPicture(mine?.src);
  return (
    <div className="my-picture">
      {thumb && <img src={thumb} alt="" className="my-picture-thumb" onError={() => reportBroken(thumb)} />}
      {mine && !thumb && <span className="muted small">Your picture didn’t load. Upload it again.</span>}
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
