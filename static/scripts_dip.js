// Check if the browser supports the Web Speech API
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;
const synth = window.speechSynthesis;
const micButton = document.getElementById('mic-button');

// Configure speech recognition
if (recognition) {
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    sendMessage(transcript);
  };

  recognition.onerror = (event) => {
    appendMessage('Speech recognition error: ' + event.error, 'error');
  };

  recognition.onend = () => {
    appendMessage('Stopped listening.', 'system');
  };

  micButton.addEventListener('click', () => {
    recognition.start();
    appendMessage('Listening...', 'system');
    setTimeout(() => {
      recognition.stop();
    }, 5000); // Stop after 5 seconds
  });
} else {
  micButton.disabled = true;
  micButton.title = 'Speech recognition not supported in this browser.';
}

// Consolidated event listener setup - only one is added here.
document.addEventListener("DOMContentLoaded", () => {
  const sendButton = document.getElementById('send-button');
  const messageInput = document.getElementById('message-input');

  if (!sendButton || !messageInput) {
    console.error("send-button or message-input not found in the DOM!");
    return;
  }

  sendButton.addEventListener("click", async () => {
    const message = messageInput.value.trim();
    if (!message) return;
    messageInput.value = '';
    appendMessage(message, 'sent');

    try {
      const affirmations = ['yes', 'yeah', 'yep', 'sure', 'okay'];
      const lowerMessage = message.toLowerCase().trim();
      const isAffirmation = affirmations.some(affirm => lowerMessage.includes(affirm));

      const response = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_input: message, is_affirmation: isAffirmation })
      });
      const data = await response.json();
      console.log("Received data:", data);
      
      if (data.error) {
        appendMessage(data.error, 'error', true);
        speak(data.error);
      } else {
        // Append the natural language response
        appendMessage(data.response, 'received', true);
        const utterance = speak(data.response);
        
        // Append song suggestions if available
        if (data.suggestions && data.suggestions.length > 0) {
          data.suggestions.forEach(song => {
            
          });
        }
        
        // Play the suggested song if available
        if (data.song && data.song.audio_url) {
          if (utterance) {
            utterance.onend = () => {
              displayMusicResult(data.song, true);
              preloadNextSong();
            };
          } else {
            displayMusicResult(data.song, true);
            preloadNextSong();
          }
        }
      }
    } catch (err) {
      appendMessage('Failed to connect to the server', 'error', true);
      speak('Failed to connect to the server');
      console.error("Fetch error:", err);
    }
  });

  messageInput.addEventListener('keydown', (event) =>{
    if (event.key === 'Enter'){
      event.preventDefault();
      sendButton.click();
    }
  });
});

let nextSong = null;
let nextAudio = null;

// Consolidated appendMessage (make sure it's defined only once)
function appendMessage(content, type, animate = false) {
  const chat = document.getElementById('chat-messages');
  const msgDiv = document.createElement('div');
  msgDiv.className = `${type}-message`;
  chat.appendChild(msgDiv);
  chat.scrollTop = chat.scrollHeight;

  if (animate) {
    const words = content.split(' ');
    msgDiv.textContent = '';
    let i = 0;
    const interval = setInterval(() => {
      if (i < words.length) {
        msgDiv.textContent += (i === 0 ? '' : ' ') + words[i];
        chat.scrollTop = chat.scrollHeight;
        i++;
      } else {
        clearInterval(interval);
      }
    }, 200);
  } else {
    msgDiv.textContent = content;
  }
}

async function sendMessage(message) {
  console.log("Sending message:", message);
  appendMessage(message, 'sent');

  // Create a typing indicator
  const typingDiv = document.createElement('div');
  typingDiv.className = 'received-message typing';
  typingDiv.textContent = '....';
  const chat = document.getElementById('chat-messages');
  chat.appendChild(typingDiv);
  chat.scrollTop = chat.scrollHeight;

  try {
    // Check for common affirmation words
    const affirmations = ['yes', 'yeah', 'yep', 'sure', 'okay'];
    const lowerMessage = message.toLowerCase().trim();
    const isAffirmation = affirmations.some(affirm => lowerMessage.includes(affirm));
    const requestBody = { user_input: message };
    if (isAffirmation) {
      requestBody.is_affirmation = true;
    }

    // Send user input to the /chat endpoint immediately
    const response = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    const data = await response.json();

    // Remove typing indicator after response
    chat.removeChild(typingDiv);

    if (data.error) {
      appendMessage(data.error, 'error', true);
      speak(data.error);
    } else {
      appendMessage(data.response, 'received', true);
      const utterance = speak(data.response);
      // Display suggestions if available
      if (data.suggestions && data.suggestions.length > 0) {
        data.suggestions.forEach(song => {
          appendMessage(`- ${song.song_name} by ${song.artist_name}`, 'received', true);
        });
      }
      // If a song object is returned, schedule its playback
      if (data.song && data.song.audio_url) {
        if (utterance) {
          utterance.onend = () => {
            displayMusicResult(data.song, null, true);
            preloadNextSong();
          };
        } else {
          displayMusicResult(data.song, null, true);
          preloadNextSong();
        }
      }
    }
  } catch (err) {
    chat.removeChild(typingDiv);
    appendMessage('Failed to connect to the server', 'error', true);
    speak('Failed to connect to the server');
    console.error("Fetch error:", err);
  }
}

function speak(text) {
    if (synth) {
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
  
      // List of keywords to identify female voices
      const femaleVoiceKeywords = ['female', 'neerja', 'heera', 'samantha', 'tessa', 'zira', 'google us english', 'google uk english female'];
  
      // Helper function to check if a voice is likely female
      const isLikelyFemale = (voice) => {
        const nameLower = voice.name.toLowerCase();
        return femaleVoiceKeywords.some(keyword => nameLower.includes(keyword));
      };
  
      // Step 1: Find voices with 'en-IN' (Indian English)
      const enINVoices = voices.filter(voice => voice.lang === 'en-IN');
  
      if (enINVoices.length > 0) {
        // Step 2: Try to find a female 'en-IN' voice
        const femaleEnINVoice = enINVoices.find(isLikelyFemale);
        if (femaleEnINVoice) {
          utterance.voice = femaleEnINVoice;
          utterance.lang = 'en-IN';
        } else {
          // If no female 'en-IN' voice, use the first 'en-IN' voice (hopefully female)
          utterance.voice = enINVoices[0];
          utterance.lang = 'en-IN';
        }
      } else {
        // Step 3: No 'en-IN' voices available, find a female English voice
        const englishVoices = voices.filter(voice => voice.lang.startsWith('en-'));
        const femaleEnglishVoice = englishVoices.find(isLikelyFemale);
        if (femaleEnglishVoice) {
          utterance.voice = femaleEnglishVoice;
          utterance.lang = femaleEnglishVoice.lang; // Match the voice's language
        } else {
          // Step 4: No female English voice found, use default voice
          console.warn("No female English voice found, using default voice.");
        }
      }
  
      synth.speak(utterance);
      appendMessage('Speaking...', 'system');
      utterance.onend = () => {
        appendMessage('Speech ended.', 'system');
      };
      utterance.onerror = (event) => {
        appendMessage('Speech synthesis error: ' + event.error, 'error');
      };
      return utterance;
    } else {
      appendMessage('Text-to-speech not supported in this browser.', 'error');
      return null;
    }
  }

window.currentVolume = 1;
// Function to display an audio player for a song
function displayMusicResult(track, autoPlay = false) {
  const container = document.getElementById('chat-messages');

  // Clean up previous WaveSurfer instance
  if(window.currentWaveSurfer) {
    window.currentWaveSurfer.destroy();
  }

  // Remove existing players
  const existingPlayers = container.getElementsByClassName('audio-player');
  while (existingPlayers.length) {
    existingPlayers[0].remove();
  }

  // Create wrapper
  const playerDiv = document.createElement('div');
  playerDiv.className = 'audio-player';
  playerDiv.style.visibility = 'hidden';
  container.appendChild(playerDiv);

  const title = document.createElement('h3');
  title.textContent = `${track.song_name} - ${track.artist_name}`;

  const waveformDiv = document.createElement('div');
  waveformDiv.id = 'waveform-' + Date.now(); // unique ID
  waveformDiv.style.marginTop = '4px';

  const controlsDiv = document.createElement('div');
  controlsDiv.className = 'controls';

  const playPauseBtn = document.createElement('button');
  playPauseBtn.innerHTML = '<i class="fa-solid fa-play fa-lg" style="color: #000000;"></i>';
  playPauseBtn.style.background = 'transparent';
  playPauseBtn.style.border = 'none';
  playPauseBtn.style.cursor = 'pointer';

  const nextBtn = document.createElement('button');
  nextBtn.innerHTML = '<i class="fa-solid fa-forward-step fa-lg" style="color: #000000;"></i>';
  nextBtn.style.background = 'transparent';
  nextBtn.style.border = 'none';
  nextBtn.style.cursor = 'pointer';

  const volume = document.createElement('input');
  volume.type = 'range';
  volume.min = 0;
  volume.max = 1;
  volume.step = 0.01;
  volume.value = window.currentVolume;

  controlsDiv.appendChild(playPauseBtn);
  controlsDiv.appendChild(nextBtn);
  controlsDiv.appendChild(volume);

  playerDiv.appendChild(title);
  playerDiv.appendChild(waveformDiv);
  playerDiv.appendChild(controlsDiv);
    
  // Init WaveSurfer
  const wavesurfer = WaveSurfer.create({
    container: `#${waveformDiv.id}`,
    waveColor: '#808080',
    progressColor: '#000000',
    height: 30,
    barWidth: 2,
    responsive: true,
    backgroundColor: '#2e2e2e',
    backend: 'MediaElement',
    mediaControls: false
  });
  
  wavesurfer.load(`/proxy_audio?url=${encodeURIComponent(track.audio_url)}`);

  // wavesurfer.setVolume(window.currentVolume);
  let isPlaying = false;
    // Setup controls
    playPauseBtn.onclick = () => {
        if(isPlaying){
            wavesurfer.pause();
            playPauseBtn.innerHTML = '<i class="fa-solid fa-play fa-lg" style="color: #000000;"></i>';
          } else {
            wavesurfer.play();
            playPauseBtn.innerHTML = '<i class="fa-solid fa-pause fa-lg" style="color: #000000;"></i>';
        }
        isPlaying = !isPlaying;
      };
      
    nextBtn.onclick = async () => {
      wavesurfer.pause();
      const res = await fetch('/next_song');
      if (res.ok){
        const data = await res.json();
        if(data.song && data.song.audio_url){
          displayMusicResult(data.song, true);
        }
      }
    };
    volume.oninput = () => {
      wavesurfer.setVolume(volume.value);
      window.currentVolume = volume.value;
    };
   
    // Function to load audio with retries
    function loadWithRetry(url, retries = 3) {
      return wavesurfer.load(url).catch((error) => {
        if (retries > 0) {
          console.warn(`Retry loading audio, attempts left: ${retries}`);
          return loadWithRetry(url, retries - 1);
        } else {
          throw error;
        }
      });
    }
    
    // Load audio and append player only on success
    loadWithRetry(`/proxy_audio?url=${encodeURIComponent(track.audio_url)}`)
    .then(() => {
      playerDiv.style.visibility = 'visible';
      if (autoPlay) {
        wavesurfer.play().then(() => {
          isPlaying = true;
          playPauseBtn.innerHTML = '<i class="fa-solid fa-pause fa-lg" style="color: #000000;"></i>';
        });
      }
    })
    .catch((error) => {
      console.error('Failed to load audio after retries:', error);
      playerDiv.remove();
      // Skip to next song
      setTimeout(async () => {
        const res = await fetch('/next_song');
        if (res.ok) {
          const data = await res.json();
          if (data.song && data.song.audio_url) {
            displayMusicResult(data.song, true);
          }
        }
      }, 2000);
    });
    
    // Finish event to play next song
    wavesurfer.on('finish', async () => {
      isPlaying = false;
      playPauseBtn.innerHTML = '<i class="fa-solid fa-play fa-lg" style="color: #000000;"></i>';
      const res = await fetch('/next_song');
      if (res.ok) {
        const data = await res.json();
        if (data.song && data.song.audio_url) {
          displayMusicResult(data.song, true);
        }
      }
    });

  // Store instance globally if needed
  window.currentWaveSurfer = wavesurfer;
}

  
  // Listens for the end of audio; then preloads or plays the next song.
  function attachEndedListener(audio) {
    audio.addEventListener('ended', async () => {
      if (nextSong && nextSong.audio_url) {
        displayMusicResult(nextSong, true);
        preloadNextSong();
      } else {
        setTimeout(async () => {
          try {
            const response = await fetch('/next_song');
            if (!response.ok) {
              appendMessage('Error fetching next song', 'error');
              return;
            }
            const data = await response.json();
            appendMessage(data.response, 'received');
            if (data.song && data.song.audio_url) {
              displayMusicResult(data.song, true);
            
            }
          } catch (err) {
            console.error('Error fetching next song:', err);
            appendMessage('Error fetching next song', 'error');
          }
        }, 1000);
      }
    });
  }


// Preload next song: declared after global variables are defined.
async function preloadNextSong() {
    try {
      const response = await fetch('/next_song');
      const data = await response.json();
      if (data.song) {
        nextSong = data.song;
        nextAudio = new Audio(`/proxy_audio?url=${encodeURIComponent(nextSong.audio_url)}`);
        nextAudio.preload = 'auto';
      } else {
        nextSong = null;
        nextAudio = null;
      }
    } catch (err) {
      console.error("Error preloading next song:", err);
      nextSong = null;
      nextAudio = null;
    }
  }
// Other functions remain unchanged
function toggleMenu() {
    var menu = document.getElementById("user-menu");
    menu.style.display = menu.style.display === "block" ? "none" : "block";
}

window.onclick = function(event) {
    if (
        !event.target.matches(".dropdown img") &&
        !event.target.matches(".dropdown span")
    ) {
        var dropdowns = document.getElementsByClassName("dropdown-content");
        for (var i = 0; i < dropdowns.length; i++) {
            var openDropdown = dropdowns[i];
            if (openDropdown.style.display === "block") {
                openDropdown.style.display = "none";
            }
        }
    }
};

function isSongNameQuery(query) {
    const moodKeywords = ["sad", "joy", "happy", "anger", "love", "relax", "party", "chill", "workout", "romantic","funny"];
    const lowerCaseQuery = query.toLowerCase();

    for (const keyword of moodKeywords) {
        if (lowerCaseQuery.includes(keyword)) {
            return false;
        }
    }
    return true;
}

function displayChatbotResponse(response) {
    const chatMessages = document.getElementById('chat-messages');
    const responseElement = document.createElement('div');
    responseElement.textContent = response;
    responseElement.classList.add('received-message');

    chatMessages.appendChild(responseElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function displayError(error) {
    const chatMessages = document.getElementById('chat-messages');
    const responseElement = document.createElement('div');
    responseElement.textContent = error;
    responseElement.classList.add('received-message');

    chatMessages.appendChild(responseElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

document.addEventListener("DOMContentLoaded", () => {
    fetch("/get_user")
        .then(response => response.json())
        .then(data => {
            const usernameDisplay = document.getElementById("username-display");
            const dropdownMenu = document.getElementById("dropdown-menu");

            if (data.username) {
                usernameDisplay.textContent = data.username;
                dropdownMenu.innerHTML = `
                    <a href="/">Home</a>
                    <a href="#">Upgrade to Premium</a>
                    <a href="#">Account Details</a>
                    <a href="/logout">Sign Out</a>
                `;
            } else {
                usernameDisplay.textContent = "Guest";
                dropdownMenu.innerHTML = `
                    <a href="/">Home</a>
                    <a href="/login">Sign In</a>
                `;
            }
        })
        .catch(error => console.error("Error fetching user:", error));
});