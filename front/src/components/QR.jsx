import { useState } from "react";
import QRCode from "react-qr-code";

export default function QR({ link }) {
    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(link);
        setIsCopied(true);
        setTimeout(() => {
            setIsCopied(false);
        }, 1500);
    }

    return(
        <div className="qr-code" onClick={handleCopy}>
            <p>Share poll link:</p>
            <QRCode value={link} alt={link} style={{ height: "auto", maxWidth: "150px", width: "100%" }} />
            <div class="Btn">
                <span class="text">{isCopied ? "Copied !" : "Copy"}</span>
                <span class="svgIcon">
                    <svg fill="white" viewBox="0 0 384 512" height="1em" xmlns="http://www.w3.org/2000/svg"><path d="M280 64h40c35.3 0 64 28.7 64 64V448c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V128C0 92.7 28.7 64 64 64h40 9.6C121 27.5 153.3 0 192 0s71 27.5 78.4 64H280zM64 112c-8.8 0-16 7.2-16 16V448c0 8.8 7.2 16 16 16H320c8.8 0 16-7.2 16-16V128c0-8.8-7.2-16-16-16H304v24c0 13.3-10.7 24-24 24H192 104c-13.3 0-24-10.7-24-24V112H64zm128-8a24 24 0 1 0 0-48 24 24 0 1 0 0 48z"></path></svg>
                </span>
            </div>
        </div>
    )
}
