import React from 'react';

interface CryptoIconProps {
  asset: string | null | undefined;
  className?: string;
  size?: number;
}

export default function CryptoIcon({ asset, className = '', size = 20 }: CryptoIconProps) {
  const normalizedAsset = (asset || '').toUpperCase().replace(/USD$/, '');

  const style = { width: `${size}px`, height: `${size}px` };

  if (normalizedAsset.includes('BTC') || normalizedAsset.includes('BITCOIN')) {
    return (
      <div className={`flex items-center justify-center rounded-[6px] bg-[#F7931A] shadow-sm ${className}`} style={style}>
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="white">
          <path d="M16.666 11.411c.717-.492 1.188-1.293 1.188-2.213 0-1.89-1.401-3.23-3.923-3.23H10V3.5h-1.5v2.468H7.5V3.5H6v2.468H4.5v1.5h1.341c.414 0 .75.336.75.75v7.564c0 .414-.336.75-.75.75H4.5v1.5H6v2.468h1.5V18.03h1.002v2.468h1.5V18.03h2.955c2.616 0 4.293-1.465 4.293-3.6 0-1.31-.69-2.38-1.834-2.954V11.41zM10 7.468h2.646c1.396 0 2.112.782 2.112 1.83 0 1.047-.716 1.83-2.112 1.83H10V7.468zm3.268 9.064H10v-3.89h3.268c1.583 0 2.428.85 2.428 1.945 0 1.095-.845 1.945-2.428 1.945z"/>
        </svg>
      </div>
    );
  }

  if (normalizedAsset.includes('ETH') || normalizedAsset.includes('ETHEREUM')) {
    return (
      <div className={`flex items-center justify-center rounded-[6px] bg-[#627EEA] shadow-sm ${className}`} style={style}>
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="white">
          <path d="M11.944 17.97L4.58 13.62 11.943 24l7.37-10.38-7.37 4.35zm.036-17.97L4.621 12.247l7.359 4.346 7.4-4.346L11.98 0z"/>
        </svg>
      </div>
    );
  }

  if (normalizedAsset.includes('SOL') || normalizedAsset.includes('SOLANA')) {
    return (
      <div className={`flex items-center justify-center rounded-[6px] bg-black shadow-sm ${className}`} style={style}>
        <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 397 311" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z" fill="url(#paint0_linear)"/>
          <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" fill="url(#paint1_linear)"/>
          <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" fill="url(#paint2_linear)"/>
          <defs>
            <linearGradient id="paint0_linear" x1="26" y1="272" x2="352" y2="272" gradientUnits="userSpaceOnUse">
              <stop stopColor="#00FFA3"/>
              <stop offset="1" stopColor="#DC1FFF"/>
            </linearGradient>
            <linearGradient id="paint1_linear" x1="26" y1="38" x2="352" y2="38" gradientUnits="userSpaceOnUse">
              <stop stopColor="#00FFA3"/>
              <stop offset="1" stopColor="#DC1FFF"/>
            </linearGradient>
            <linearGradient id="paint2_linear" x1="45" y1="155" x2="371" y2="155" gradientUnits="userSpaceOnUse">
              <stop stopColor="#00FFA3"/>
              <stop offset="1" stopColor="#DC1FFF"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
  }

  if (normalizedAsset.includes('JUP') || normalizedAsset.includes('JUPITER')) {
    return (
      <div className={`flex items-center justify-center rounded-[6px] bg-black shadow-sm ${className}`} style={style}>
        <svg width={size * 0.75} height={size * 0.75} viewBox="0 0 33 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <g clipPath="url(#clip0_11565_169621)">
            <path d="M3.09074 25.1666C4.44267 27.0471 6.17683 28.6205 8.1795 29.7838C10.1822 30.947 12.4081 31.6738 14.7114 31.9165C13.5264 30.1333 11.8039 28.4928 9.65354 27.2438C7.50318 25.9948 5.22592 25.3125 3.09074 25.1666Z" fill="url(#paint0_linear_11565_169621)"/>
            <path d="M12.543 22.2705C8.40015 19.8636 3.91612 19.2502 0.707663 20.3338C1.0174 21.3575 1.42589 22.3487 1.92738 23.2934C4.71498 23.2288 7.75856 23.9859 10.5906 25.6308C13.4227 27.2757 15.5888 29.5459 16.9143 32C17.9839 31.9672 19.0479 31.8309 20.0913 31.5932C19.4426 28.2698 16.6849 24.6779 12.543 22.2705Z" fill="url(#paint1_linear_11565_169621)"/>
            <path d="M32.2852 12.5009C31.7585 10.3584 30.8054 8.34403 29.4829 6.57804C28.1604 4.81205 26.4956 3.33067 24.5879 2.22235C22.6802 1.11403 20.5687 0.401504 18.3796 0.127309C16.1904 -0.146885 13.9684 0.0228794 11.8463 0.626465C15.3915 1.06033 19.3267 2.39122 23.1859 4.63324C27.0452 6.87525 30.1533 9.63411 32.2852 12.5009Z" fill="url(#paint2_linear_11565_169621)"/>
            <path d="M27.1271 20.3583C25.3124 17.3446 22.2038 14.4588 18.3743 12.2342C14.5449 10.0095 10.4991 8.7388 6.98531 8.65474C3.894 8.58152 1.57389 9.48017 0.621548 11.1197C0.616125 11.1294 0.608532 11.1386 0.602566 11.1484C0.516877 11.4559 0.44312 11.7639 0.37587 12.0731C1.70568 11.5481 3.24645 11.2558 4.95969 11.2232C8.76959 11.1517 13.0334 12.3703 16.9681 14.6562C20.9027 16.9422 24.0759 20.0438 25.9003 23.3878C26.7182 24.8944 27.2285 26.3777 27.4308 27.7948C27.6662 27.5844 27.8972 27.3669 28.1212 27.1408C28.1272 27.1305 28.131 27.1196 28.1369 27.1088C29.0893 25.4677 28.721 23.0076 27.1271 20.3583Z" fill="url(#paint3_linear_11565_169621)"/>
            <path d="M15.4609 17.2485C9.59662 13.8416 3.11626 13.3079 0 15.6855C0.00612096 16.4297 0.0630166 17.1726 0.170292 17.9091C1.08699 17.6312 2.03177 17.4562 2.98718 17.3874C6.46952 17.1254 10.3087 18.0957 13.7927 20.1207C17.2766 22.1458 20.023 25.0018 21.5209 28.1543C21.935 29.018 22.2508 29.9254 22.4624 30.8595C23.1555 30.5878 23.8294 30.2694 24.4794 29.9066C25.0011 26.0213 21.3268 20.656 15.4609 17.2485Z" fill="url(#paint4_linear_11565_169621)"/>
            <path d="M30.1434 15.3141C28.3082 12.3036 25.1724 9.40969 21.3158 7.17039C17.4593 4.93109 13.3977 3.64033 9.87257 3.53674C7.1853 3.45919 5.10382 4.11053 4.02457 5.34109C8.50588 4.58182 14.4168 5.85794 20.146 9.18625C25.8753 12.5146 29.9135 17.0181 31.4722 21.2868C32.0064 19.7406 31.5416 17.6098 30.1434 15.3141Z" fill="url(#paint5_linear_11565_169621)"/>
          </g>
          <defs>
            <linearGradient id="paint0_linear_11565_169621" x1="21.5" y1="6.5" x2="6.66667" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0.0001" stopColor="#C7F284"/>
              <stop offset="1" stopColor="#00BEF0"/>
            </linearGradient>
            <linearGradient id="paint1_linear_11565_169621" x1="21.5" y1="6.5" x2="6.66667" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0.0001" stopColor="#C7F284"/>
              <stop offset="1" stopColor="#00BEF0"/>
            </linearGradient>
            <linearGradient id="paint2_linear_11565_169621" x1="21.5" y1="6.5" x2="6.66667" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0.0001" stopColor="#C7F284"/>
              <stop offset="1" stopColor="#00BEF0"/>
            </linearGradient>
            <linearGradient id="paint3_linear_11565_169621" x1="21.5" y1="6.5" x2="6.66667" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0.0001" stopColor="#C7F284"/>
              <stop offset="1" stopColor="#00BEF0"/>
            </linearGradient>
            <linearGradient id="paint4_linear_11565_169621" x1="21.5" y1="6.5" x2="6.66667" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0.0001" stopColor="#C7F284"/>
              <stop offset="1" stopColor="#00BEF0"/>
            </linearGradient>
            <linearGradient id="paint5_linear_11565_169621" x1="21.5" y1="6.5" x2="6.66667" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0.0001" stopColor="#C7F284"/>
              <stop offset="1" stopColor="#00BEF0"/>
            </linearGradient>
            <clipPath id="clip0_11565_169621">
              <rect width="32.2852" height="32" fill="white"/>
            </clipPath>
          </defs>
        </svg>
      </div>
    );
  }

  if (normalizedAsset.includes('DOGE') || normalizedAsset.includes('DOGECOIN')) {
    return (
      <div className={`flex items-center justify-center rounded-[6px] bg-[#C3A634] shadow-sm ${className}`} style={style}>
        <svg width={size * 0.65} height={size * 0.65} viewBox="0 0 32 32" fill="white">
          <path d="M13.248 14.61h4.314v2.286h-4.314v4.818h2.721q1.615 0 2.644-.437q1.029-.436 1.615-1.21a4.4 4.4 0 0 0 .796-1.815a11.4 11.4 0 0 0 .21-2.252a11.4 11.4 0 0 0-.21-2.252a4.4 4.4 0 0 0-.796-1.815q-.587-.774-1.615-1.21q-1.029-.437-2.644-.437h-2.721v4.325zm-2.766 2.286H9v-2.285h1.482V8h6.549q1.815 0 3.142.627q1.327.628 2.168 1.715q.84 1.086 1.25 2.543T24 16a11.5 11.5 0 0 1-.41 3.115q-.408 1.456-1.25 2.543q-.84 1.087-2.167 1.715q-1.328.627-3.142.627h-6.549z" />
        </svg>
      </div>
    );
  }

  // Fallback for other generic markets
  return (
    <div
      className={`flex items-center justify-center rounded-[6px] font-bold shadow-sm bg-gray-700 text-white ${className}`}
      style={{ ...style, fontSize: `${size * 0.5}px` }}
    >
      {normalizedAsset ? normalizedAsset.charAt(0) : '?'}
    </div>
  );
}
