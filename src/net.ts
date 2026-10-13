/** Network helpers with no dependency on the 3D code, so the page's UI can load them first. */

/** Asset base: everything under public/ */
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

/** How urgently a download is wanted: `high` for what is on screen now, `low` for what is
 * only being prepared in the background. The browser may ignore it. */
export type Priority = 'high' | 'low' | 'auto';

const fetchOk = async (url: string, priority: Priority = 'auto') => {
  const r = await fetch(url, priority === 'auto' ? undefined : { priority });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r;
};

export const fetchJson = async <T,>(path: string, priority: Priority = 'auto'): Promise<T> =>
  (await fetchOk(asset(path), priority)).json() as Promise<T>;
export const fetchBuffer = async (path: string, priority: Priority = 'auto') =>
  (await fetchOk(asset(path), priority)).arrayBuffer();
