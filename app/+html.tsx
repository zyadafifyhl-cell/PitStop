import { ScrollViewStyleReset } from 'expo-router/html';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/* 
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native. 
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
html, body, #root, #__next {
  background-color: #F8FAFC;
}
@media (prefers-color-scheme: dark) {
  html, body, #root, #__next {
    background-color: #000000;
  }
}
html[data-theme="dark"],
html[data-theme="dark"] body,
html[data-theme="dark"] #root,
html[data-theme="dark"] #__next {
  background-color: #000000 !important;
  color: #F8FAFC;
}
html[data-theme="light"],
html[data-theme="light"] body,
html[data-theme="light"] #root,
html[data-theme="light"] #__next {
  background-color: #F8FAFC !important;
  color: #0F172A;
}
input::-ms-reveal,
input::-ms-clear {
  display: none;
}
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus,
textarea:-webkit-autofill,
select:-webkit-autofill {
  -webkit-text-fill-color: inherit !important;
  caret-color: inherit;
  transition: background-color 99999s ease-out 0s;
  box-shadow: 0 0 0 1000px #FFFFFF inset !important;
}
html[data-theme="dark"] input:-webkit-autofill,
html[data-theme="dark"] input:-webkit-autofill:hover,
html[data-theme="dark"] input:-webkit-autofill:focus,
html[data-theme="dark"] textarea:-webkit-autofill,
html[data-theme="dark"] select:-webkit-autofill {
  -webkit-text-fill-color: #F8FAFC !important;
  caret-color: #F8FAFC;
  box-shadow: 0 0 0 1000px #111111 inset !important;
}`;
