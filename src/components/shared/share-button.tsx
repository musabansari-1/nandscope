import { useState } from "react";
import { serializeShareState, type ShareState } from "@/core/trace/share";

export function ShareButton({ state }: { state: ShareState }) {
  const [message, setMessage] = useState("");
  const [sharing, setSharing] = useState(false);
  function link() {
    const hash = serializeShareState(state);
    history.replaceState(null, "", hash);
    return `${location.origin}${location.pathname}${hash}`;
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link()); setMessage("Link copied"); setSharing(false); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to copy the link"); }
  }
  async function share() {
    try {
      const url = link();
      if (navigator.share) { setSharing(true); setMessage("Share dialog open"); await navigator.share({ title: "NANDscope · source to silicon", url }); setMessage("View shared"); setSharing(false); }
      else await copy();
    } catch (error) { setSharing(false); if (error instanceof Error && error.name === "AbortError") setMessage("Share cancelled"); else await copy(); }
  }
  return <span className="share-control"><button className="quiet-button" onClick={share}>Share this view</button>{sharing && <button className="quiet-button" onClick={copy}>Copy link instead</button>}<span role="status">{message}</span></span>;
}
