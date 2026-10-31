import { useEffect } from 'react';

export default function LivePollLogoManager() {

  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  function randomBarWidth() {
    const barNumber = rand(1,3).toString();
    const randomPercentage = rand(15,90).toString() + '%';

    const logos = document.getElementsByClassName("livepoll-logo");
    for (let i = 0; i < logos.length; i++) {
      logos[i].style.setProperty('--logo-bar-width-' + barNumber, randomPercentage)
    }
  }

  // A single loop for the lifetime of the component (it used to start a new one on every render)
  useEffect(() => {
    randomBarWidth();
    const interval = setInterval(randomBarWidth, 2000);

    return () => clearInterval(interval);
  }, []);
}

//done
