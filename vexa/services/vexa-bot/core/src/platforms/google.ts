import { Page } from "playwright";
import { log, randomDelay } from "../utils";
import { BotConfig } from "../types";
import { retryActionWithWait } from "../utils/resilience";
import { takeRetryFailureScreenshot, takeDebugScreenshot } from "../utils/debug";

export async function handleGoogleMeet(
  botConfig: BotConfig,
  page: Page,
  gracefulLeaveFunction: (page: Page | null, exitCode: number, reason: string) => Promise<void>
): Promise<void> {
  const leaveButton = `//button[@aria-label="Leave call"]`;

  if (!botConfig.meetingUrl) {
    log("Error: Meeting URL is required for Google Meet but is null.");
    // If meeting URL is missing, we can't join, so trigger graceful leave.
    await gracefulLeaveFunction(page, 1, "missing_meeting_url");
    return;
  }

  log("Joining Google Meet");
  try {
    await joinMeeting(page, botConfig.meetingUrl, botConfig.botName);
    log("Join meeting completed successfully");
    await takeDebugScreenshot(page, "after-join-meeting", "join_meeting_completed");
  } catch (error: any) {
    console.error("Error during joinMeeting: " + error.message);
    log("Error during joinMeeting: " + error.message + ". Taking screenshot and triggering graceful leave.");
    await takeDebugScreenshot(page, "join-meeting-error", "join_meeting_failed");
    await gracefulLeaveFunction(page, 1, "join_meeting_error");
    return;
  }

  // Wait for admission first, then setup recording - like ScreenApp
  log("Waiting for meeting admission");
  try {
    // Wait for admission to the meeting FIRST
    const isAdmitted = await waitForMeetingAdmission(
      page,
      leaveButton,
      botConfig.automaticLeave.waitingRoomTimeout
    ).catch((error) => {
      log("Meeting admission failed: " + error.message);
      return false;
    });

    if (!isAdmitted) {
      console.error("Bot was not admitted into the meeting");
      log("Bot not admitted. Taking final screenshot and triggering graceful leave with admission_failed reason.");
      await takeDebugScreenshot(page, "admission-failed-final", "admission_failed_final");
      await gracefulLeaveFunction(page, 2, "admission_failed");
      return; 
    }

    log("Successfully admitted to the meeting, preparing for recording");
    await takeDebugScreenshot(page, "before-prepare-recording", "admitted_to_meeting");
    
    // Retry prepareForRecording with backoff if it fails
    const maxRetries = 3;
    for (let i = 0; i < maxRetries; i++) {
      try {
        await prepareForRecording(page);
        log("Recording preparation successful");
        await takeDebugScreenshot(page, "recording-prepared", "recording_preparation_successful");
        break; // Success
      } catch (error: any) {
        log(`prepareForRecording failed (attempt ${i + 1}/${maxRetries}): ${error.message}`);
        await takeDebugScreenshot(page, `recording-prep-fail-attempt-${i+1}`, `recording_preparation_failed_attempt_${i+1}`);
        if (i === maxRetries - 1) {
          log("Failed to prepare recording after all retries. Taking screenshot and leaving meeting.");
          await takeDebugScreenshot(page, "recording-prep-all-retries-failed", "recording_preparation_all_retries_failed");
          await gracefulLeaveFunction(page, 3, "prepare_recording_failed");
          return;
        }
        log(`Retrying prepareForRecording in 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
      }
    }
    
    log("Starting recording");
    await takeDebugScreenshot(page, "before-start-recording", "before_starting_recording");
    // Pass platform from botConfig to startRecording
    await startRecording(page, botConfig);
  } catch (error: any) {
    console.error("Error after join attempt (admission/recording setup): " + error.message);
    log("Error after join attempt (admission/recording setup): " + error.message + ". Taking screenshot and triggering graceful leave.");
    await takeDebugScreenshot(page, "post-join-setup-error", "post_join_setup_error");
    // Use a general error code here, as it could be various issues.
    await gracefulLeaveFunction(page, 1, "post_join_setup_error");
    return;
  }
}

// New function to wait for meeting admission
const waitForMeetingAdmission = async (
  page: Page,
  leaveButton: string,
  timeout: number
): Promise<boolean> => {
  try {
    await page.waitForSelector(leaveButton, { timeout });
    log("Successfully admitted to the meeting");
    await takeDebugScreenshot(page, "successfully-admitted", "meeting_admitted");
    return true;
  } catch {
    log("Failed to get admitted - taking screenshot for debug");
    await takeDebugScreenshot(page, "admission-failed", "admission_timeout");
    throw new Error(
      "Bot was not admitted into the meeting within the timeout period"
    );
  }
};

// Prepare for recording by exposing necessary functions
const prepareForRecording = async (page: Page): Promise<void> => {
  // Expose the logBot function to the browser context
  await page.exposeFunction("logBot", (msg: string) => {
    log(msg);
  });
};

const joinMeeting = async (page: Page, meetingUrl: string, botName: string) => {
  const enterNameField = 'input[type="text"][aria-label="Your name"]';
  const joinButton = '//button[.//span[text()="Ask to join"]]';
  const muteButton = '[aria-label*="Turn off microphone"]';
  const cameraOffButton = '[aria-label*="Turn off camera"]';

  log(`Starting joinMeeting process for URL: ${meetingUrl}`);

  // Inject anti-detection code using addInitScript
  await page.addInitScript(() => {
    // Disable navigator.webdriver to avoid detection
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });

    // Override navigator.plugins to simulate real plugins
    Object.defineProperty(navigator, "plugins", {
      get: () => [
        { name: "Chrome PDF Plugin" },
        { name: "Chrome PDF Viewer" },
        { name: "Native Client" },
      ],
    });

    // Override navigator.languages to simulate real languages
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });

    // Override other properties to simulate real browser
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 4 });
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
    Object.defineProperty(navigator, "platform", { get: () => "Win32" });
    
    // Override screen properties
    Object.defineProperty(screen, "width", { get: () => 1920 });
    Object.defineProperty(screen, "height", { get: () => 1080 });
    Object.defineProperty(screen, "availWidth", { get: () => 1920 });
    Object.defineProperty(screen, "availHeight", { get: () => 1040 });
  });

  log("Navigating to meeting URL...");
  await page.goto(meetingUrl, { waitUntil: "networkidle" });
  await page.bringToFront();
  log("Navigation completed, taking screenshot...");
  await takeDebugScreenshot(page, "after-navigation", "navigation_completed");

  // Simulate human-like mouse movements
  await page.mouse.move(10, 372);
  await page.mouse.move(102, 572);
  await page.mouse.move(114, 672);
  await page.waitForTimeout(300);
  await page.mouse.move(114, 100);
  await page.mouse.click(100, 100);

  // Add a longer, fixed wait after navigation for page elements to settle
  log("Waiting for page elements to settle after navigation...");
  await page.waitForTimeout(5000); // Wait 5 seconds
  log("Page elements should be settled, taking screenshot...");
  await takeDebugScreenshot(page, "after-page-settle", "page_elements_settled");

  // Enter name and join with retry
  await page.waitForTimeout(randomDelay(1000));
  log("Attempting to find name input field...");
  
  await retryActionWithWait(
    "Waiting for the input field",
    async () => await page.waitForSelector(enterNameField, { timeout: 30000 }),
    3,
    15000,
    async () => await takeRetryFailureScreenshot(page, "waiting-for-input-field")
  );
  log("Name input field found.");

  await page.waitForTimeout(randomDelay(1000));
  log(`Filling name field with: ${botName}`);
  await page.fill(enterNameField, botName);
  log("Name field filled, taking screenshot...");
  await takeDebugScreenshot(page, "name-field-filled", "name_field_filled");

  // Mute mic and camera if available
  try {
    log("Attempting to mute microphone...");
    await page.waitForTimeout(randomDelay(500));
    await page.click(muteButton, { timeout: 200 });
    await page.waitForTimeout(200);
    log("Microphone muted successfully");
  } catch (e) {
    log("Microphone already muted or not found.");
  }
  try {
    log("Attempting to turn off camera...");
    await page.waitForTimeout(randomDelay(500));
    await page.click(cameraOffButton, { timeout: 200 });
    await page.waitForTimeout(200);
    log("Camera turned off successfully");
  } catch (e) {
    log("Camera already off or not found.");
  }

  log("Attempting to click Ask to join button...");
  await retryActionWithWait(
    "Clicking the Ask to join button",
    async () => {
      await page.waitForSelector(joinButton, { timeout: 30000 });
      await page.click(joinButton);
    },
    3,
    10000,
    async () => await takeRetryFailureScreenshot(page, "clicking-ask-to-join")
  );
  log(`${botName} requested to join the Meeting. Taking screenshot...`);
  await takeDebugScreenshot(page, "ask-to-join-clicked", "ask_to_join_button_clicked");
};

// Modified to have only the actual recording functionality
const startRecording = async (page: Page, botConfig: BotConfig) => {
  // Destructure needed fields from botConfig
  const { meetingUrl, token, connectionId, platform, nativeMeetingId } =
    botConfig; // nativeMeetingId is now in BotConfig type

  //NOTE: The environment variables passed by docker_utils.py will be available to the Node.js process started by your entrypoint.sh.
  // --- Read GLADIA_API_KEY from Node.js environment ---
  const gladiaApiKey = process.env.GLADIA_API_KEY;

  if (!gladiaApiKey) {
    // Use the Node-side 'log' utility here
    log(
      "ERROR: GLADIA_API_KEY environment variable is not set for vexa-bot in its Node.js environment. Cannot start recording."
    );
    return; // Or handle more gracefully
  }
  log(`[Node.js] GLADIA_API_KEY is configured for vexa-bot`);
  // --- ------------------------------------------------- ---

  log("Starting actual recording with direct Gladia API connection");

  // Pass the necessary config fields and the resolved URL into the page context. Inisde page.evalute we have the browser context.
  //All code inside page.evalute executes as javascript running in the browser.
  await page.evaluate(
    async (pageArgs: {
      botConfigData: BotConfig;
      gladiaApiKey: string;
    }) => {
      const { botConfigData, gladiaApiKey } = pageArgs;
      // Destructure from botConfigData as needed
      const {
        meetingUrl,
        token,
        connectionId: originalConnectionId,
        platform,
        nativeMeetingId,
        language: initialLanguage,
        task: initialTask,
      } = botConfigData; // Use the nested botConfigData

      // Helper function to generate UUID in browser context
      const generateUUID = () => {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
          return crypto.randomUUID();
        } else {
          // Basic fallback if crypto.randomUUID is not available
          return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
            /[xy]/g,
            function (c) {
              var r = (Math.random() * 16) | 0,
                v = c == "x" ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            }
          );
        }
      };

      await new Promise<void>(async (resolve, reject) => {
        try {
          (window as any).logBot("Starting recording process.");
          
          // More robust media element finding function
          const findMediaElements = async (retries = 30, delay = 2000): Promise<HTMLMediaElement[]> => {
            for (let i = 0; i < retries; i++) {
                const mediaElements = Array.from(
                    document.querySelectorAll("audio, video")
                ).filter((el: any) => 
                    !el.paused && 
                    el.srcObject instanceof MediaStream && 
                    el.srcObject.getAudioTracks().length > 0
                ) as HTMLMediaElement[];

                if (mediaElements.length > 0) {
                    (window as any).logBot(`Found ${mediaElements.length} active media elements with audio tracks after ${i + 1} attempt(s).`);
                    return mediaElements;
                }
                (window as any).logBot(`[Audio] No active media elements found. Retrying in ${delay}ms... (Attempt ${i + 2}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            return [];
          };

          findMediaElements().then(async mediaElements => {
            if (mediaElements.length === 0) {
              (window as any).logBot("[Audio] Still no media elements after extended wait. Deferring initialization until audio appears.");
              const waitAgainMs = 5000;
              setTimeout(async () => {
                const recheck = await findMediaElements();
                if (recheck.length === 0) {
                  (window as any).logBot("[Audio] Media still unavailable. Will continue monitoring participants and retry later.");
                } else {
                  (window as any).logBot(`[Audio] Media became available: ${recheck.length} element(s). Proceeding.`);
                }
              }, waitAgainMs);
            }

            // Create audio context and destination for mixing multiple streams
            (window as any).logBot(
              `Found ${mediaElements.length} active media elements.`
            );
            const audioContext = new AudioContext();
            try {
              (window as any).logBot(`[AudioContext] Initial state: ${audioContext.state}`);
              if (audioContext.state !== 'running') {
                audioContext.resume().then(() => {
                  (window as any).logBot(`[AudioContext] Resumed. Current state: ${audioContext.state}`);
                }).catch((resumeErr: any) => {
                  (window as any).logBot(`[AudioContext] Resume failed: ${resumeErr?.message || resumeErr}`);
                });
              }
            } catch (resumeErr: any) {
              (window as any).logBot(`[AudioContext] Resume failed (outer catch): ${resumeErr?.message || resumeErr}`);
            }
            const destinationNode = audioContext.createMediaStreamDestination();
            let sourcesConnected = 0;

            // Connect all media elements to the destination node
            mediaElements.forEach((element: any, index: number) => {
              try {
                const elementStream =
                  element.srcObject ||
                  (element.captureStream && element.captureStream()) ||
                  (element.mozCaptureStream && element.mozCaptureStream());

                if (
                  elementStream instanceof MediaStream &&
                  elementStream.getAudioTracks().length > 0
                ) {
                  const sourceNode =
                    audioContext.createMediaStreamSource(elementStream);
                  sourceNode.connect(destinationNode);
                  sourcesConnected++;
                  (window as any).logBot(
                    `Connected audio stream from element ${index + 1}/${
                      mediaElements.length
                    }.`
                  );
                }
              } catch (error: any) {
                (window as any).logBot(
                  `Could not connect element ${index + 1}: ${error.message}`
                );
              }
            });

            if (sourcesConnected === 0) {
              return reject(
                new Error(
                  "[BOT Error] Could not connect any audio streams. Check media permissions."
                )
              );
            }

            // Use the combined stream instead of a single element's stream
            const stream = destinationNode.stream;
            (window as any).logBot(
              `Successfully combined ${sourcesConnected} audio streams.`
            );

            // Keep original connectionId but don't use it for WebSocket UID
            // const sessionUid = connectionId; // <-- OLD: Reused original connectionId
            (window as any).logBot(
              `Original bot connection ID: ${originalConnectionId}`
            );

            // Add secondary leave button selector for confirmation
            const secondaryLeaveButtonSelector = `//button[.//span[text()='Leave meeting']] | //button[.//span[text()='Just leave the meeting']]`; // Example, adjust based on actual UI
            // Browser-scope state for current WS config
            let currentWsLanguage = initialLanguage;
            let currentWsTask = initialTask;

            let socket: WebSocket | null = null;
            let isServerReady = false;
            let retryCount = 0;
            const configuredInterval = botConfigData.reconnectionIntervalMs;
            const baseRetryDelay = (configuredInterval && configuredInterval >= 1000) ? configuredInterval : 2000; // Default 2s if not set

            let sessionAudioStartTimeMs: number | null = null; // ADDED: For relative speaker timestamps
            let audioChunksSentCount: number = 0; // ADDED: Watchdog counter
            let lastAudioChunkSentAtMs: number = 0; // ADDED: Watchdog timestamp
            let audioWatchdogIntervalHandle: number | null = null; // ADDED: Watchdog interval handle

            let currentGladiaSessionId: string | null = null;
            // Helper: structured leave logging without sending any control message to Gladia
            function logLeave(reason: string, extra: any = {}) {
              try {
                let participantIds: any[] = [];
                try {
                  // activeParticipants may not be initialized yet
                  // @ts-ignore
                  if (typeof activeParticipants !== 'undefined' && activeParticipants && activeParticipants.keys) {
                    // @ts-ignore
                    participantIds = Array.from(activeParticipants.keys());
                  }
                } catch (_) {}
                const payload = {
                  type: 'LEAVING_MEETING',
                  reason,
                  uid: currentSessionUid,
                  ts: Date.now(),
                  participants: participantIds,
                  ...extra
                };
                (window as any).logBot(`[LEAVE_EVENT] ${JSON.stringify(payload)}`);
              } catch (e: any) {
                (window as any).logBot(`[LEAVE_EVENT_ERROR] ${e?.message || e}`);
              }
            }
            
            const setupGladiaSession = async () => {
              try {
                if (socket) {
                  // Close previous socket if it exists
                  try {
                    socket.close();
                  } catch (err) {
                    // Ignore errors when closing
                  }
                }

                // Initialize Gladia session only if we don't have one
                let sessionData: any;
                let wsUrl: string;
                
                if (currentGladiaSessionId) {
                  // Reuse existing session
                  (window as any).logBot(`Reusing existing Gladia session: ${currentGladiaSessionId}`);
                  wsUrl = `wss://api.gladia.io/v2/live?token=${currentGladiaSessionId}`;
                  sessionData = { id: currentGladiaSessionId };
                } else {
                  // Create new session
                  const gladiaApiUrl = "https://api.gladia.io";
                  const initResponse = await fetch(`${gladiaApiUrl}/v2/live`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "X-GLADIA-KEY": gladiaApiKey,
                    },
                    body: JSON.stringify({
                      encoding: "wav/pcm",
                      bit_depth: 16,
                      sample_rate: 16000,
                      channels: 1,
                      language_config: {
                        languages: [], // Auto-détection de langue
                        code_switching: true,
                      },
                      pre_processing: {
                        audio_enhancer: true,
                        speech_threshold: 0.01, // Seuil ultra-bas
                      },
                      // Remove diarization config (Gladia rejects post_processing.diarization on /v2/live)
                      // Ensure we receive post-processing events on the socket
                      messages_config: {
                        receive_partial_transcripts: false,
                        receive_final_transcripts: true,
                        receive_speech_events: true,
                        receive_pre_processing_events: true,
                        receive_realtime_processing_events: true,
                        receive_post_processing_events: true,
                        receive_acknowledgments: true,
                        receive_errors: true,
                        receive_lifecycle_events: false
                      }
                    }),
                  });

                  if (!initResponse.ok) {
                    const errorText = await initResponse.text();
                    throw new Error(`Failed to initialize Gladia session: ${initResponse.status} ${initResponse.statusText} - ${errorText}`);
                  }

                  sessionData = await initResponse.json();
                  wsUrl = sessionData.url;
                  currentGladiaSessionId = sessionData.id;
                  
                  (window as any).logBot(`Gladia session initialized: ${sessionData.id}`);
                  (window as any).logBot(`WebSocket URL: ${wsUrl}`);
                }
                
                // Save Gladia session ID to bot-manager
                if (botConfigData.botManagerCallbackUrl) {
                  try {
                    const callbackUrl = botConfigData.botManagerCallbackUrl.replace('/exited', '/gladia-session');
                    fetch(callbackUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        connection_id: botConfigData.connectionId,
                        gladia_session_id: sessionData.id
                      })
                    }).then(response => {
                      if (response.ok) {
                        (window as any).logBot(`✅ Gladia session ID ${sessionData.id} saved to bot-manager`);
                      } else {
                        (window as any).logBot(`❌ Failed to save Gladia session ID: ${response.status}`);
                      }
                    }).catch(error => {
                      (window as any).logBot(`❌ Error saving Gladia session ID: ${error.message}`);
                    });
                  } catch (error: any) {
                    (window as any).logBot(`❌ Error preparing Gladia session ID save: ${error.message}`);
                  }
                }

                socket = new WebSocket(wsUrl);

                // Disable aggressive CONNECTING watchdog to avoid flapping
                let connectionTimeoutHandle: number | null = null;

                socket.onopen = function () {
                  if (connectionTimeoutHandle !== null) {
                    clearTimeout(connectionTimeoutHandle); // Clear connection watchdog
                    connectionTimeoutHandle = null;
                  }
                  // Log current config being used
                  // Generate NEW UUID for this connection
                  currentSessionUid = generateUUID(); // Update the currentSessionUid
                  sessionAudioStartTimeMs = null; // ADDED: Reset for new WebSocket session
                  (window as any).logBot(
                    `[RelativeTime] WebSocket connection opened. New UID: ${currentSessionUid}. sessionAudioStartTimeMs reset. Lang: ${currentWsLanguage}, Task: ${currentWsTask}`
                  );
                  retryCount = 0;

                  if (socket) {
                    (window as any).logBot(
                      `✅ WebSocket connected to Gladia. Ready to send audio.`
                    );
                  }

                  // Audio watchdog removed to prevent premature disconnections
                  audioChunksSentCount = 0;
                  lastAudioChunkSentAtMs = 0;
                };

                socket.onmessage = (event) => {
                  (window as any).logBot("Received message: " + event.data);
                  const data = JSON.parse(event.data);
                  
                  // Handle different message types according to Gladia documentation
                  if (data.type === "transcript") {
                    const transcript = data.data;
                    if (transcript.utterance && transcript.utterance.text) {
                      const isFinal = transcript.is_final;
                      const text = transcript.utterance.text;
                      const start = transcript.utterance.start;
                      const end = transcript.utterance.end;
                      const language = transcript.utterance.language;
                      
                      (window as any).logBot(
                        `🎤 ${isFinal ? 'FINAL' : 'PARTIAL'} TRANSCRIPT: "${text}" (${start}s-${end}s, lang: ${language})`
                      );
                      
                      // Send to Redis for processing
                      if (isFinal) {
                        // TODO: Send final transcript to Redis stream
                        (window as any).logBot(`📤 Sending final transcript to Redis: "${text}"`);
                      }
                    }
                  } else if (data.type === "audio_chunk") {
                    // Audio chunk acknowledgment - just log for debugging
                    (window as any).logBot(`✅ Audio chunk acknowledged: ${data.data.byte_range[0]}-${data.data.byte_range[1]}`);
                  } else if (data.status === "ERROR") {
                    (window as any).logBot(
                      `❌ WebSocket Server Error: ${data.message}`
                    );
                  } else if (data.status === "WAIT") {
                    (window as any).logBot(`⏳ Server busy: ${data.message}`);
                  } else if (!isServerReady) {
                    isServerReady = true;
                    (window as any).logBot("✅ Server is ready.");
                  } else if (data.language) {
                    (window as any).logBot(
                      `🌍 Language detected: ${data.language}`
                    );
                  } else if (data.message === "DISCONNECT") {
                    (window as any).logBot("🔌 Server requested disconnect.");
                    if (socket) {
                      socket.close();
                    }
                  } else {
                    (window as any).logBot(
                      `📨 Other message: ${JSON.stringify(data)}`
                    );
                  }
                };

                socket.onerror = (event) => {
                  if (connectionTimeoutHandle !== null) {
                    clearTimeout(connectionTimeoutHandle);
                    connectionTimeoutHandle = null;
                  }
                  (window as any).logBot(
                    `WebSocket error: ${JSON.stringify(event)}`
                  );
                };

                socket.onclose = (event) => {
                  if (connectionTimeoutHandle !== null) {
                    clearTimeout(connectionTimeoutHandle);
                    connectionTimeoutHandle = null;
                  }
                  // Stop audio watchdog
                  if (audioWatchdogIntervalHandle !== null) {
                    clearInterval(audioWatchdogIntervalHandle);
                    audioWatchdogIntervalHandle = null;
                  }
                  (window as any).logBot(
                    `WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`
                  );

                  // Retry logic with limit
                  retryCount++;
                  const maxRetries = 5; // Limit retries to avoid infinite loops
                  
                  if (retryCount > maxRetries) {
                    (window as any).logBot(
                      `❌ Maximum retry attempts (${maxRetries}) reached. Stopping WebSocket reconnection.`
                    );
                    return;
                  }
                  
                  const delay = Math.min(30000, baseRetryDelay * Math.pow(2, retryCount - 1));
                  (window as any).logBot(
                    `Attempting to reconnect in ${delay}ms. Retry attempt ${retryCount}/${maxRetries}`
                  );

                  setTimeout(async () => {
                    (window as any).logBot(
                      `Retrying WebSocket connection (attempt ${retryCount}/${maxRetries})...`
                    );
                    await setupGladiaSession();
                  }, delay);
                };
              } catch (e: any) {
                (window as any).logBot(`Error creating WebSocket: ${e.message}`);
                // For initial connection errors, handle with retry logic with limit
                retryCount++;
                const maxRetries = 5; // Limit retries to avoid infinite loops
                
                if (retryCount > maxRetries) {
                  (window as any).logBot(
                    `❌ Maximum retry attempts (${maxRetries}) reached. Stopping WebSocket reconnection.`
                  );
                  return;
                }
                
                const delay = Math.min(30000, baseRetryDelay * Math.pow(2, retryCount - 1));
                (window as any).logBot(
                  `Error during WebSocket setup. Attempting to reconnect in ${delay}ms. Retry attempt ${retryCount}/${maxRetries}`
                );

                setTimeout(async () => {
                  (window as any).logBot(
                    `Retrying WebSocket connection (attempt ${retryCount}/${maxRetries})...`
                  );
                  await setupGladiaSession();
                }, delay);
              }
            };

            // --- ADD Function exposed to Node.js for triggering reconfigure ---
            (window as any).triggerWebSocketReconfigure = (
              newLang: string | null,
              newTask: string | null
            ) => {
              (window as any).logBot(
                `[Node->Browser] Received reconfigure. New Lang: ${newLang}, New Task: ${newTask}`
              );
              currentWsLanguage = newLang; // Update browser state
              currentWsTask = newTask || "transcribe"; // Update browser state, default task if null

              if (socket && socket.readyState === WebSocket.OPEN) {
                (window as any).logBot(
                  "[Node->Browser] Closing WebSocket to reconnect with new config."
                );
                socket.close(); // Triggers onclose -> setupWebSocket which now reads updated vars
              } else if (
                socket &&
                (socket.readyState === WebSocket.CONNECTING ||
                  socket.readyState === WebSocket.CLOSING)
              ) {
                (window as any).logBot(
                  "[Node->Browser] Socket is connecting or closing, cannot close now. Reconnect will use new config when it opens."
                );
              } else {
                // Socket is null or already closed
                (window as any).logBot(
                  "[Node->Browser] Socket is null or closed. Attempting to setupWebSocket directly."
                );
                // Directly calling setupWebSocket might cause issues if the old one is mid-retry
                // Relying on the existing retry logic in onclose is likely safer.
                // If setupWebSocket is called here, ensure it handles potential double connections.
                // setupWebSocket();
              }
            };
            // --- ----------------------------------------------------------- ---

            // --- ADDED: Expose leave function to Node context ---
            (window as any).performLeaveAction = async () => {
              (window as any).logBot(
                "Attempting to leave the meeting from browser context..."
              );
              try {
                // Stop recording and close WebSocket properly
                if (socket && socket.readyState === WebSocket.OPEN) {
                  (window as any).logBot("🛑 Sending stop_recording to Gladia...");
                  socket.send(JSON.stringify({
                    type: "stop_recording",
                  }));
                  
                  // Wait a moment for the message to be sent
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  
                  (window as any).logBot("🔌 Closing WebSocket connection...");
                  socket.close(1000); // Close with code 1000 (normal closure)
                }
                // *** FIXED: Use document.evaluate for XPath ***
                const primaryLeaveButtonXpath = `//button[@aria-label="Leave call"]`;
                const secondaryLeaveButtonXpath = `//button[.//span[text()='Leave meeting']] | //button[.//span[text()='Just leave the meeting']]`;

                const getElementByXpath = (path: string): HTMLElement | null => {
                  const result = document.evaluate(
                    path,
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                  );
                  return result.singleNodeValue as HTMLElement | null;
                };

                const primaryLeaveButton = getElementByXpath(
                  primaryLeaveButtonXpath
                );
                if (primaryLeaveButton) {
                  (window as any).logBot("Clicking primary leave button...");
                  primaryLeaveButton.click(); // No need to cast HTMLElement if getElementByXpath returns it
                  await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait a bit for potential confirmation dialog

                  // Try clicking secondary/confirmation button if it appears
                  const secondaryLeaveButton = getElementByXpath(
                    secondaryLeaveButtonXpath
                  );
                  if (secondaryLeaveButton) {
                    (window as any).logBot(
                      "Clicking secondary/confirmation leave button..."
                    );
                    secondaryLeaveButton.click();
                    await new Promise((resolve) => setTimeout(resolve, 500)); // Short wait after final click
                  } else {
                    (window as any).logBot("Secondary leave button not found.");
                  }
                  (window as any).logBot("Leave sequence completed.");
                  return true; // Indicate leave attempt was made
                } else {
                  (window as any).logBot("Primary leave button not found.");
                  return false; // Indicate leave button wasn't found
                }
              } catch (err: any) {
                (window as any).logBot(
                  `Error during leave attempt: ${err.message}`
                );
                return false; // Indicate error during leave
              }
            };
            // --- --------------------------------------------- ---

            setupGladiaSession();

            // --- ADD: Speaker Detection Logic (Adapted from speakers_console_test.js) ---
            // Configuration for speaker detection
            // Enhanced participant selector based on research from other Google Meet bot projects
            const participantSelector = 'div[data-participant-id], div[data-requested-participant-id], span.zWGUib'; // Multiple fallback selectors
            const speakingClasses = ['Oaajhc', 'HX2H7', 'wEsLMd', 'OgVli']; // Speaking/animation classes
            const silenceClass = 'gjg47c';        // Class indicating the participant is silent
            const nameSelectors = [               // Try these selectors to find participant's name
                '[data-participant-id]'           // Attribute for participant ID
            ];

            // State for tracking speaking status
            const speakingStates = new Map(); // Stores the logical speaking state for each participant ID
            const activeParticipants = new Map(); // NEW: Central map for all known participants

            // Track current session UID for speaker events
            let currentSessionUid = generateUUID(); // Initialize with a new UID

            // Helper functions for speaker detection
            function getParticipantId(element: HTMLElement) {
                let id = element.getAttribute('data-participant-id');
                if (!id) {
                    const stableChild = element.querySelector('[jsinstance]');
                    if (stableChild) {
                        id = stableChild.getAttribute('jsinstance');
                    }
                }
                if (!id) {
                    if (!(element as any).dataset.vexaGeneratedId) {
                        (element as any).dataset.vexaGeneratedId = 'vexa-id-' + Math.random().toString(36).substr(2, 9);
                    }
                    id = (element as any).dataset.vexaGeneratedId;
                }
                return id;
            }

            function getParticipantName(participantElement: HTMLElement) {
                const mainTile = participantElement.closest('[data-participant-id]') as HTMLElement;
                if (mainTile) {
                    const userExampleNameElement = mainTile.querySelector('span.notranslate');
                    if (userExampleNameElement && userExampleNameElement.textContent && userExampleNameElement.textContent.trim()) {
                        const nameText = userExampleNameElement.textContent.trim();
                        if (nameText.length > 1 && nameText.length < 50 && /^[\p{L}\s.'-]+$/u.test(nameText)) {
                            const forbiddenSubstrings = ["more_vert", "mic_off", "mic", "videocam", "videocam_off", "present_to_all", "devices", "speaker", "speakers", "microphone"];
                            if (!forbiddenSubstrings.some(sub => nameText.toLowerCase().includes(sub.toLowerCase()))) {
                                return nameText;
                            }
                        }
                    }
                    const googleTsNameSelectors = [
                        '[data-self-name]', '.zWGUib', '.cS7aqe.N2K3jd', '.XWGOtd', '[data-tooltip*="name"]'
                    ];
                    for (const selector of googleTsNameSelectors) {
                        const nameElement = mainTile.querySelector(selector) as HTMLElement;
                        if (nameElement) {
                            let nameText = (nameElement as HTMLElement).textContent || 
                                          (nameElement as HTMLElement).innerText || 
                                          nameElement.getAttribute('data-self-name') || 
                                          nameElement.getAttribute('data-tooltip');
                            if (nameText && nameText.trim()) {
                                if (selector.includes('data-tooltip') && nameText.includes("Tooltip for ")) {
                                    nameText = nameText.replace("Tooltip for ", "").trim();
                                }
                                if (nameText && nameText.trim()) {
                                    const forbiddenSubstrings = ["more_vert", "mic_off", "mic", "videocam", "videocam_off", "present_to_all", "devices", "speaker", "speakers", "microphone"];
                                    if (!forbiddenSubstrings.some(sub => nameText!.toLowerCase().includes(sub.toLowerCase()))) {
                                        const trimmedName = nameText!.split('\n').pop()?.trim();
                                        return trimmedName || 'Unknown (Filtered)';
                                    }
                                }
                            }
                        }
                    }
                }
                for (const selector of nameSelectors) {
                    const nameElement = participantElement.querySelector(selector) as HTMLElement;
                    if (nameElement) {
                        let nameText = (nameElement as HTMLElement).textContent || 
                                      (nameElement as HTMLElement).innerText || 
                                      nameElement.getAttribute('data-self-name');
                        if (nameText && nameText.trim()) {
                            // ADDED: Apply forbidden substrings and trimming logic here too
                            const forbiddenSubstrings = ["more_vert", "mic_off", "mic", "videocam", "videocam_off", "present_to_all", "devices", "speaker", "speakers", "microphone"];
                            if (!forbiddenSubstrings.some(sub => nameText!.toLowerCase().includes(sub.toLowerCase()))) {
                                const trimmedName = nameText!.split('\n').pop()?.trim();
                                if (trimmedName && trimmedName.length > 1 && trimmedName.length < 50 && /^[\p{L}\s.'-]+$/u.test(trimmedName)) { // Added basic length and char validation
                                   return trimmedName;
                                }
                            }
                            // If it was forbidden or failed validation, it won't return, allowing loop to continue or fallback.
                        }
                    }
                }
                if (participantElement.textContent && participantElement.textContent.includes("You") && participantElement.textContent.length < 20) {
                    return "You";
                }
                const idToDisplay = mainTile ? getParticipantId(mainTile) : getParticipantId(participantElement);
                return `Participant (${idToDisplay})`;
            }

            function sendSpeakerEvent(eventType: string, participantElement: HTMLElement) {
                const eventAbsoluteTimeMs = Date.now();
                let relativeTimestampMs: number | null = null;

                if (sessionAudioStartTimeMs === null) {
                    (window as any).logBot(`[RelativeTime] SKIPPING speaker event: ${eventType} for ${getParticipantName(participantElement)}. sessionAudioStartTimeMs not yet set. UID: ${currentSessionUid}`);
                    return; // Do not send if audio hasn't started for this session
                }

                relativeTimestampMs = eventAbsoluteTimeMs - sessionAudioStartTimeMs;

                const participantId = getParticipantId(participantElement);
                const participantName = getParticipantName(participantElement);

                // Do not send legacy speaker_activity to Gladia (unsupported). Log locally only.
                (window as any).logBot(`[RelativeTime] (disabled) speaker_activity ${eventType} for ${participantName} (${participantId}). RelativeTs: ${relativeTimestampMs}ms. UID: ${currentSessionUid}.`);
            }

            function logSpeakerEvent(participantElement: HTMLElement, mutatedClassList: DOMTokenList) {
                const participantId = getParticipantId(participantElement);
                const participantName = getParticipantName(participantElement);
                const previousLogicalState = speakingStates.get(participantId) || "silent";

                const isNowVisiblySpeaking = speakingClasses.some(cls => mutatedClassList.contains(cls));
                const isNowVisiblySilent = mutatedClassList.contains(silenceClass);

                if (isNowVisiblySpeaking) {
                    if (previousLogicalState !== "speaking") {
                        (window as any).logBot(`🎤 SPEAKER_START: ${participantName} (ID: ${participantId})`);
                        sendSpeakerEvent("SPEAKER_START", participantElement);
                    }
                    speakingStates.set(participantId, "speaking");
                    lastActivityTime = Date.now(); // Update activity time on speaking
                } else if (isNowVisiblySilent) {
                    if (previousLogicalState === "speaking") {
                        (window as any).logBot(`🔇 SPEAKER_END: ${participantName} (ID: ${participantId})`);
                        sendSpeakerEvent("SPEAKER_END", participantElement);
                    }
                    speakingStates.set(participantId, "silent");
                }
            }

            function observeParticipant(participantElement: HTMLElement) {
                const participantId = getParticipantId(participantElement);
                
                // Determine initial logical state based on current classes
                speakingStates.set(participantId, "silent"); // Initialize participant as silent. logSpeakerEvent will handle transitions.

                let classListForInitialScan = participantElement.classList; // Default to the main participant element's classes
                // Check if any descendant has a speaking class
                for (const cls of speakingClasses) {
                    const descendantElement = participantElement.querySelector('.' + cls); // Corrected selector
                    if (descendantElement) {
                        classListForInitialScan = descendantElement.classList;
                        break;
                    }
                }
                // If no speaking descendant was found, classListForInitialScan remains participantElement.classList.
                // This is correct for checking if participantElement itself has a speaking or silence class.

                (window as any).logBot(`👁️ Observing: ${getParticipantName(participantElement)} (ID: ${participantId}). Performing initial participant state analysis.`);
                // Call logSpeakerEvent with the determined classList.
                // It will compare against the "silent" state and emit SPEAKER_START if currently speaking,
                // or do nothing if currently silent (matching the initialized state).
                logSpeakerEvent(participantElement, classListForInitialScan);
                
                // NEW: Add participant to our central map
                activeParticipants.set(participantId, { name: getParticipantName(participantElement), element: participantElement });

                const callback = function(mutationsList: MutationRecord[], observer: MutationObserver) {
                    for (const mutation of mutationsList) {
                        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                            const targetElement = mutation.target as HTMLElement;
                            if (targetElement.matches(participantSelector) || participantElement.contains(targetElement)) {
                                const finalTarget = targetElement.matches(participantSelector) ? targetElement : participantElement;
                                // logSpeakerEvent(finalTarget, finalTarget.classList); // Old line
                                logSpeakerEvent(finalTarget, targetElement.classList); // Corrected line
                            }
                        }
                    }
                };

                const observer = new MutationObserver(callback);
                observer.observe(participantElement, { 
                    attributes: true, 
                    attributeFilter: ['class'],
                    subtree: true 
                });
                
                if (!(participantElement as any).dataset.vexaObserverAttached) {
                     (participantElement as any).dataset.vexaObserverAttached = 'true';
                }
            }

            function scanForAllParticipants() {
                // Enhanced participant detection with multiple methods (inspired by MeetingBot API)
                
                // Method 1: Standard participant selector
                const participantElements = document.querySelectorAll(participantSelector);
                for (let i = 0; i < participantElements.length; i++) {
                    const el = participantElements[i] as HTMLElement;
                    if (!(el as any).dataset.vexaObserverAttached) {
                         observeParticipant(el);
                    }
                }
                
                // Method 2: Check for merged audio participants (MeetingBot API method)
                const mergedAudioNode = document.querySelector('[aria-label="Merged audio"]');
                if (mergedAudioNode && mergedAudioNode.parentNode) {
                    (window as any).logBot('Found merged audio node, scanning for additional participants');
                    mergedAudioNode.parentNode.childNodes.forEach((childNode: any) => {
                        if (childNode.nodeType === Node.ELEMENT_NODE) {
                            const participantId = childNode.getAttribute("data-participant-id");
                            if (participantId && !(childNode as any).dataset.vexaObserverAttached) {
                                (window as any).logBot(`Found participant in merged audio: ${participantId}`);
                                observeParticipant(childNode);
                            }
                        }
                    });
                }
                
                // Method 3: Fallback search using Balena MeetBot's method
                const nameSpans = document.querySelectorAll('span.zWGUib');
                nameSpans.forEach((span) => {
                    const participantDiv = span.closest('[data-participant-id]') || span.closest('div');
                    if (participantDiv && !(participantDiv as any).dataset.vexaObserverAttached) {
                        (window as any).logBot(`Found participant via name span: ${span.textContent}`);
                        observeParticipant(participantDiv as HTMLElement);
                    }
                });
            }

            // Initialize speaker detection
            scanForAllParticipants();

            // Monitor for new participants
            const bodyObserver = new MutationObserver((mutationsList) => {
                for (const mutation of mutationsList) {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                const elementNode = node as HTMLElement;
                                if (elementNode.matches(participantSelector) && !(elementNode as any).dataset.vexaObserverAttached) {
                                    observeParticipant(elementNode);
                                }
                                const childElements = elementNode.querySelectorAll(participantSelector);
                                for (let i = 0; i < childElements.length; i++) {
                                    const childEl = childElements[i] as HTMLElement;
                                    if (!(childEl as any).dataset.vexaObserverAttached) {
                                        observeParticipant(childEl);
                                    }
                                }
                            }
                        });
                        mutation.removedNodes.forEach(node => {
                             if (node.nodeType === Node.ELEMENT_NODE) {
                                const elementNode = node as HTMLElement;
                                if (elementNode.matches(participantSelector)) {
                                   const participantId = getParticipantId(elementNode);
                                   const participantName = getParticipantName(elementNode);
                                   if (speakingStates.get(participantId) === 'speaking') {
                                        // Send synthetic SPEAKER_END if they were speaking when removed
                                        (window as any).logBot(`🔇 SPEAKER_END (Participant removed while speaking): ${participantName} (ID: ${participantId})`);
                                        sendSpeakerEvent("SPEAKER_END", elementNode);
                                   }
                                   speakingStates.delete(participantId);
                                   delete (elementNode as any).dataset.vexaObserverAttached;
                                   delete (elementNode as any).dataset.vexaGeneratedId;
                                   (window as any).logBot(`🗑️ Removed observer for: ${participantName} (ID: ${participantId})`);
                                   
                                   // NEW: Remove participant from our central map
                                   activeParticipants.delete(participantId);
                                }
                             }
                        });
                    }
                }
            });

            bodyObserver.observe(document.body, {
                childList: true,
                subtree: true
            });

            // --- ADD: Enhanced Leave Function with Session End Signal ---
            (window as any).performLeaveAction = async () => {
                (window as any).logBot("Attempting to leave the meeting from browser context...");
                
                // Structured leave log for traceability
                logLeave('manual_leave_action');

                try {
                    // *** FIXED: Use document.evaluate for XPath ***
                    const primaryLeaveButtonXpath = `//button[@aria-label="Leave call"]`;
                    const secondaryLeaveButtonXpath = `//button[.//span[text()='Leave meeting']] | //button[.//span[text()='Just leave the meeting']]`;

                    const getElementByXpath = (path: string): HTMLElement | null => {
                        const result = document.evaluate(
                            path,
                            document,
                            null,
                            XPathResult.FIRST_ORDERED_NODE_TYPE,
                            null
                        );
                        return result.singleNodeValue as HTMLElement | null;
                    };

                    const primaryLeaveButton = getElementByXpath(
                      primaryLeaveButtonXpath
                    );
                    if (primaryLeaveButton) {
                      (window as any).logBot("Clicking primary leave button...");
                      primaryLeaveButton.click(); // No need to cast HTMLElement if getElementByXpath returns it
                      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait a bit for potential confirmation dialog

                      // Try clicking secondary/confirmation button if it appears
                      const secondaryLeaveButton = getElementByXpath(
                        secondaryLeaveButtonXpath
                      );
                      if (secondaryLeaveButton) {
                        (window as any).logBot(
                          "Clicking secondary/confirmation leave button..."
                        );
                        secondaryLeaveButton.click();
                        await new Promise((resolve) => setTimeout(resolve, 500)); // Short wait after final click
                      } else {
                        (window as any).logBot("Secondary leave button not found.");
                      }
                      (window as any).logBot("Leave sequence completed.");
                      return true; // Indicate leave attempt was made
                    } else {
                      (window as any).logBot("Primary leave button not found.");
                      return false; // Indicate leave button wasn't found
                    }
                } catch (err: any) {
                  (window as any).logBot(
                    `Error during leave attempt: ${err.message}`
                  );
                  return false; // Indicate error during leave
                }
            };
            // --- --------------------------------------------- ---

            // FIXED: Revert to original audio processing that works with whisperlive
            // but use our combined stream as the input source
            const audioDataCache = [];
            const mediaStream = audioContext.createMediaStreamSource(stream); // Use our combined stream
            const recorder = audioContext.createScriptProcessor(4096, 1, 1);
            // Optional silent keep-alive timer
            let keepAliveTimer: number | null = null;

            recorder.onaudioprocess = async (event) => {
              // Check if socket is open (Gladia doesn't send "ready" message)
              if (
                !socket ||
                socket.readyState !== WebSocket.OPEN
              ) {
                // (window as any).logBot("WS not ready or closed, skipping audio data send."); // Optional debug log
                return;
              }

              // Set sessionAudioStartTimeMs on the first audio chunk for this session
              if (sessionAudioStartTimeMs === null) {
                  sessionAudioStartTimeMs = Date.now();
                  (window as any).logBot(`[RelativeTime] sessionAudioStartTimeMs set for UID ${currentSessionUid}: ${sessionAudioStartTimeMs} (at first audio data process)`);
              }

              const inputData = event.inputBuffer.getChannelData(0);
              const data = new Float32Array(inputData);
              const targetLength = Math.round(
                data.length * (16000 / audioContext.sampleRate)
              );
              const resampledData = new Float32Array(targetLength);
              const springFactor = (data.length - 1) / (targetLength - 1);
              resampledData[0] = data[0];
              resampledData[targetLength - 1] = data[data.length - 1];
              for (let i = 1; i < targetLength - 1; i++) {
                const index = i * springFactor;
                const leftIndex = Math.floor(index);
                const rightIndex = Math.ceil(index);
                const fraction = index - leftIndex;
                resampledData[i] =
                  data[leftIndex] +
                  (data[rightIndex] - data[leftIndex]) * fraction;
              }
              // Send resampledData
              if (socket && socket.readyState === WebSocket.OPEN) {
                // Double check before sending
                // Ensure sessionAudioStartTimeMs is set before sending audio.
                // This check is more of a safeguard; it should be set by the logic above.
                if (sessionAudioStartTimeMs === null) {
                  (window as any).logBot(`[RelativeTime] CRITICAL WARNING: sessionAudioStartTimeMs is STILL NULL before sending audio data for UID ${currentSessionUid}. This should not happen.`);
                  // Optionally, set it here as a last resort, though it might be slightly delayed.
                  // sessionAudioStartTimeMs = Date.now();
                  // (window as any).logBot(`[RelativeTime] sessionAudioStartTimeMs set LATE for UID ${currentSessionUid}: ${sessionAudioStartTimeMs}`);
                  return; // Or decide if you want to send audio even if T0 was missed. For now, skipping if T0 is critical.
                }
                // Convert Float32Array to Int16Array (PCM 16-bit) for Gladia
                const pcmData = new Int16Array(resampledData.length);
                for (let i = 0; i < resampledData.length; i++) {
                  // Convert float [-1, 1] to int16 [-32768, 32767]
                  const sample = Math.max(-1, Math.min(1, resampledData[i]));
                  pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                }
                // Debug: Vérifier si l'audio contient du son
                let hasAudio = false;
                let maxAmplitude = 0;
                for (let i = 0; i < pcmData.length; i++) {
                    const amplitude = Math.abs(pcmData[i]);
                    if (amplitude > 40) { // Slightly lower threshold to avoid false silence
                        hasAudio = true;
                    }
                    if (amplitude > maxAmplitude) {
                        maxAmplitude = amplitude;
                    }
                }
                
                // Don't send audio chunks if there's no audio (silence)
                if (hasAudio) {
                    socket.send(pcmData.buffer); // send the PCM audio buffer to Gladia socket
                    (window as any).logBot(`🎵 Audio chunk sent: ${pcmData.length} samples (PCM 16-bit) - Max amplitude: ${maxAmplitude} - Has audio: ${hasAudio ? 'YES' : 'NO'}`);
                    audioChunksSentCount++;
                    lastAudioChunkSentAtMs = Date.now();
                } else {
                    (window as any).logBot(`🔇 Silent chunk skipped: ${pcmData.length} samples (PCM 16-bit) - Max amplitude: ${maxAmplitude} - Has audio: ${hasAudio ? 'YES' : 'NO'}`);
                }
              }
            };

            // Connect the audio processing pipeline
            mediaStream.connect(recorder);
            const gainNode = audioContext.createGain();
            gainNode.gain.value = 0;
            recorder.connect(gainNode);
            gainNode.connect(audioContext.destination);

            (window as any).logBot(
              "Audio processing pipeline connected and sending data silently."
            );

            // Setup optional silent keep-alive if configured
            try {
              const keepAliveIntervalMs = (botConfigData as any).keepAliveIntervalMs;
              if (keepAliveIntervalMs && typeof keepAliveIntervalMs === 'number' && keepAliveIntervalMs > 0) {
                (window as any).logBot(`[KeepAlive] Enabled. Interval: ${keepAliveIntervalMs}ms`);
                const sendSilentKeepAlive = () => {
                  if (!socket || socket.readyState !== WebSocket.OPEN) return;
                  // Send a tiny near-silent PCM buffer to keep session warm
                  const length = 320; // ~20ms at 16kHz
                  const pcmData = new Int16Array(length);
                  for (let i = 0; i < length; i++) {
                    pcmData[i] = (i % 2 === 0) ? 1 : -1; // near-silent waveform
                  }
                  try {
                    socket.send(pcmData.buffer);
                    (window as any).logBot(`[KeepAlive] Sent silent keep-alive chunk (${length} samples).`);
                  } catch (e: any) {
                    (window as any).logBot(`[KeepAlive] Error sending keep-alive: ${e?.message || e}`);
                  }
                };
                keepAliveTimer = window.setInterval(sendSilentKeepAlive, keepAliveIntervalMs);
              } else {
                (window as any).logBot(`[KeepAlive] Disabled.`);
              }
            } catch (e: any) {
              (window as any).logBot(`[KeepAlive] Setup error: ${e?.message || e}`);
            }

            // Handle "Got it" popups that may appear
            const handleGotItPopups = async () => {
              try {
                (window as any).logBot('Checking for "Got it" popups...');
                
                let gotItButtonsClicked = 0;
                let previousButtonCount = -1;
                let consecutiveNoChangeCount = 0;
                const maxConsecutiveNoChange = 2;

                while (true) {
                  // Find all visible "Got it" buttons
                  const visibleButtons = Array.from(
                    document.querySelectorAll('button')
                  ).filter((btn: any) => {
                    const text = btn.textContent || btn.innerText || '';
                    return text.toLowerCase().includes('got it') && 
                           btn.offsetParent !== null; // Check if visible
                  });
                
                  const currentButtonCount = visibleButtons.length;
                  
                  if (currentButtonCount === 0) {
                    break;
                  }
                  
                  // Check if button count hasn't changed
                  if (currentButtonCount === previousButtonCount) {
                    consecutiveNoChangeCount++;
                    if (consecutiveNoChangeCount >= maxConsecutiveNoChange) {
                      (window as any).logBot(`Button count hasn't changed for ${maxConsecutiveNoChange} iterations, stopping`);
                      break;
                    }
                  } else {
                    consecutiveNoChangeCount = 0;
                  }
                  
                  previousButtonCount = currentButtonCount;

                  for (const btn of visibleButtons) {
                    try {
                      (btn as HTMLElement).click();
                      gotItButtonsClicked++;
                      (window as any).logBot(`Clicked "Got it" button #${gotItButtonsClicked}`);
                      
                      await new Promise(resolve => setTimeout(resolve, 2000));
                    } catch (err) {
                      (window as any).logBot('Click failed, possibly already dismissed');
                    }
                  }
                
                  await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
                if (gotItButtonsClicked > 0) {
                  (window as any).logBot(`Successfully handled ${gotItButtonsClicked} "Got it" popup(s)`);
                }
              } catch (error: any) {
                (window as any).logBot('Error handling Got it popups: ' + error.message);
              }
            };

            // Handle popups first
            await handleGotItPopups();

            // Try to click the "People" button to open participant panel (optional)
            // Using improved selectors from other Google Meet bot projects
            let peopleButton = null;
            
            // Method 1: New People icon detection (most reliable - from MeetingBot API)
            const peopleIconButton = Array.from(document.querySelectorAll("i"))
              .find((el) => el.textContent?.trim() === "people");
            if (peopleIconButton) {
              peopleButton = peopleIconButton.closest("button");
            }
            
            // Method 2: Traditional aria-label selectors with fallbacks
            if (!peopleButton) {
              peopleButton = document.querySelector('button[aria-label^="People"]') ||
                           document.querySelector('button[aria-label*="participants"]') ||
                           document.querySelector('button[aria-label*="People"]') ||
                           document.querySelector('button[data-testid="people-button"]');
            }
            
            if (peopleButton) {
              (window as any).logBot('Found People button using improved selectors, clicking to open participant panel');
              (peopleButton as HTMLElement).click();
              
              // Wait for participants panel to load
              setTimeout(() => {
                const participantsPanel = document.querySelector('[aria-label="Participants"]');
                if (participantsPanel) {
                  (window as any).logBot('Participants panel opened successfully');
                } else {
                  (window as any).logBot('Participants panel not found after click - will use alternative detection');
                }
              }, 1000);
            } else {
              (window as any).logBot('People button not found with any selector - continuing with alternative participant detection methods');
            }

            // Monitor participant list every 5 seconds
            let aloneTime = 0; // legacy variable, no longer used for leaving
            let noParticipantsMs = 0;
            let aloneWithBotMs = 0;
            // Enhanced timeout configuration based on research from other Google Meet bots
            const everyoneLeftTimeoutMs = (botConfigData as any).automaticLeave && (botConfigData as any).automaticLeave.everyoneLeftTimeout ? (botConfigData as any).automaticLeave.everyoneLeftTimeout : 60000; // 1 minute when everyone left
            const aloneTimeoutMs = (botConfigData as any).automaticLeave && (botConfigData as any).automaticLeave.noOneJoinedTimeout ? (botConfigData as any).automaticLeave.noOneJoinedTimeout : 60000; // 60s when alone (increased from 5s)
            const inactivityTimeoutMs = (botConfigData as any).automaticLeave && (botConfigData as any).automaticLeave.inactivityTimeout ? (botConfigData as any).automaticLeave.inactivityTimeout : 300000; // 5 minutes of no activity
            // Enhanced participant detection with failure resilience like ScreenApp
            let detectionFailures = 0;
            const maxDetectionFailures = 10; // Track up to 10 consecutive failures
            let lastActivityTime = Date.now(); // Track when last speaker activity occurred
            let lastParticipantCountTime = Date.now(); // Track when last participant was seen
            
            // Enhanced kick detection system (inspired by MeetingBot)
            const checkKickedFromMeeting = () => {
              try {
                // Method 1: Check for "Return to home screen" button (kick condition 1)
                const returnHomeButton = document.querySelector('button[aria-label="Return to home screen"]') ||
                  (() => {
                    const spans = Array.from(document.querySelectorAll('button span')) as HTMLElement[];
                    const span = spans.find(s => (s.textContent || '').trim() === 'Return to home screen');
                    return span ? (span.closest('button') as HTMLElement | null) : null;
                  })();
                if (returnHomeButton) {
                  (window as any).logBot('Detected "Return to home screen" button - bot was kicked');
                  return true;
                }

                // Method 2: Check if Leave call button is hidden (kick condition 2)
                const leaveButton = document.querySelector('button[aria-label="Leave call"]');
                if (leaveButton && (leaveButton as HTMLElement).offsetParent === null) {
                  (window as any).logBot('Leave call button is hidden - may have been kicked');
                  return true;
                }

                // Method 3: Check for removal messages (kick condition 3)
                const bodyText = document.body.innerText;
                const kickMessages = [
                  'You\'ve been removed from the meeting',
                  'You have been removed from this meeting',
                  'The meeting has ended',
                  'This meeting has ended'
                ];
                
                for (const message of kickMessages) {
                  if (bodyText.includes(message)) {
                    (window as any).logBot('Detected kick/end message: ' + message);
                    return true;
                  }
                }

                return false;
              } catch (error: any) {
                (window as any).logBot('Error checking kick status: ' + error.message);
                return false;
              }
            };

            // Check if we're still on a valid Google Meet page (inspired by ScreenApp)
            const isOnValidGoogleMeetPage = () => {
              try {
                // Check if we're still on a Google Meet URL
                const currentUrl = window.location.href;
                if (!currentUrl.includes('meet.google.com')) {
                  (window as any).logBot('No longer on Google Meet page - URL changed to: ' + currentUrl);
                  return false;
                }

                // Use enhanced kick detection
                if (checkKickedFromMeeting()) {
                  (window as any).logBot('Bot has been kicked or meeting has ended');
                  return false;
                }

                // Check for basic Google Meet UI elements
                const hasMeetElements = document.querySelector('button[aria-label="People"]') !== null ||
                                      document.querySelector('button[aria-label="Leave call"]') !== null;

                if (!hasMeetElements) {
                  (window as any).logBot('Google Meet UI elements not found - page may have changed state');
                  return false;
                }

                return true;
              } catch (error: any) {
                (window as any).logBot('Error checking page validity: ' + error.message);
                return false;
              }
            };

            const checkInterval = setInterval(() => {
              try {
                // First check if we're still on a valid Google Meet page
                if (!isOnValidGoogleMeetPage()) {
                  (window as any).logBot('Google Meet page state changed - ending recording');
                  logLeave('page_state_changed');
                  clearInterval(checkInterval);
                  recorder.disconnect();
                  if (keepAliveTimer !== null) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
                  (window as any).triggerNodeGracefulLeave();
                  resolve();
                  return;
                }

                // UPDATED: Use the size of our central map as the source of truth
                let count = 0; // Declare count outside try-catch
                try {
                  count = activeParticipants.size;
                  const participantIds = Array.from(activeParticipants.keys());
                  (window as any).logBot(`Participant check: Found ${count} unique participants from central list. IDs: ${JSON.stringify(participantIds)}`);

                  // Reset failure count on successful detection
                  detectionFailures = 0;

                  // If count is 0, it could mean everyone left, OR the participant list area itself is gone.
                  if (count === 0) {
                      const peopleListContainer = document.querySelector('[role="list"]'); // Check the original list container
                      if (!peopleListContainer || !document.body.contains(peopleListContainer)) {
                           (window as any).logBot(
                              "Participant list container not found (and participant count is 0); assuming meeting ended."
                           );
                           logLeave('people_list_missing_assume_meeting_ended');
                           clearInterval(checkInterval);
                           recorder.disconnect();
                           if (keepAliveTimer !== null) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
                           (window as any).triggerNodeGracefulLeave();
                           resolve(); // Resolve the main promise from page.evaluate
                           return;   // Exit setInterval callback
                      }
                  }
                } catch (error: any) {
                  detectionFailures++;
                  (window as any).logBot('Participant detection failed: ' + error.message + ' (Failure count: ' + detectionFailures + ')');
                  
                  if (detectionFailures >= maxDetectionFailures) {
                    (window as any).logBot('Participant detection consistently failing - this may indicate a Google Meet UI change. Meeting will continue until other timeout conditions.');
                    // Don't clear interval, just stop failing - let other conditions handle the exit
                  }
                  return; // Skip participant count logic on detection failure
                }

                // Leave when no participants remain for configured timeout
                if (count === 0) {
                  noParticipantsMs += 5000;
                  (window as any).logBot(`[Participants] No participants. Accumulated: ${noParticipantsMs}ms / threshold ${everyoneLeftTimeoutMs}ms`);
                  if (noParticipantsMs >= everyoneLeftTimeoutMs) {
                    (window as any).logBot("No participants for configured timeout. Leaving meeting...");
                    logLeave('no_participants_timeout', { duration_ms: noParticipantsMs });
                    clearInterval(checkInterval);
                    recorder.disconnect();
                    if (keepAliveTimer !== null) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
                    (window as any).triggerNodeGracefulLeave();
                    resolve();
                  }
                } else if (count <= 1) { // Only the bot remains
                  aloneWithBotMs += 5000;
                  (window as any).logBot(`[Participants] Alone with bot. Accumulated: ${aloneWithBotMs}ms / threshold ${aloneTimeoutMs}ms`);
                  if (aloneWithBotMs >= aloneTimeoutMs) {
                    (window as any).logBot("Alone with bot for configured timeout. Leaving meeting...");
                    logLeave('alone_with_bot_timeout', { duration_ms: aloneWithBotMs });
                    clearInterval(checkInterval);
                    recorder.disconnect();
                    if (keepAliveTimer !== null) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
                    (window as any).triggerNodeGracefulLeave();
                    resolve();
                  }
                } else {
                  if (noParticipantsMs > 0) {
                    (window as any).logBot('[Participants] Someone present. Resetting no-participants timer.');
                  }
                  noParticipantsMs = 0;
                  aloneWithBotMs = 0;
                }
              } catch (error: any) {
                (window as any).logBot('Error in participant check interval: ' + error.message);
                // Don't clear interval on error, just log it
              }
            }, 5000);

            // Listen for unload and visibility changes
            window.addEventListener("beforeunload", () => {
              (window as any).logBot("Page is unloading. Stopping recorder...");
              logLeave('page_beforeunload');
              clearInterval(checkInterval);
              recorder.disconnect();
              if (keepAliveTimer !== null) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
              (window as any).triggerNodeGracefulLeave();
              resolve();
            });
            document.addEventListener("visibilitychange", () => {
              if (document.visibilityState === "hidden") {
                (window as any).logBot(
                  "Document is hidden. Stopping recorder..."
                );
                logLeave('document_hidden');
                clearInterval(checkInterval);
                recorder.disconnect();
                if (keepAliveTimer !== null) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
                (window as any).triggerNodeGracefulLeave();
                resolve();
              }
            });
          }).catch(err => {
              reject(err);
          });
          } catch (error: any) {
            return reject(new Error("[BOT Error] " + error.message));
          }
        });
      },
      { botConfigData: botConfig, gladiaApiKey: gladiaApiKey }
    ); // Pass arguments to page.evaluate
};

// Remove the compatibility shim 'recordMeeting' if no longer needed,
// otherwise, ensure it constructs a valid BotConfig object.
// Example if keeping:
/*
const recordMeeting = async (page: Page, meetingUrl: string, token: string, connectionId: string, platform: "google_meet" | "zoom" | "teams") => {
  await prepareForRecording(page);
  // Construct a minimal BotConfig - adjust defaults as needed
  const dummyConfig: BotConfig = {
      platform: platform,
      meetingUrl: meetingUrl,
      botName: "CompatibilityBot",
      token: token,
      connectionId: connectionId,
      nativeMeetingId: "", // Might need to derive this if possible
      automaticLeave: { waitingRoomTimeout: 300000, noOneJoinedTimeout: 300000, everyoneLeftTimeout: 300000 },
  };
  await startRecording(page, dummyConfig);
};
*/

// --- ADDED: Exported function to trigger leave from Node.js ---
export async function leaveGoogleMeet(page: Page): Promise<boolean> {
  log("[leaveGoogleMeet] Triggering leave action in browser context...");
  if (!page || page.isClosed()) {
    log("[leaveGoogleMeet] Page is not available or closed.");
    return false;
  }
  try {
    // Call the function exposed within the page's evaluate context
    const result = await page.evaluate(async () => {
      if (typeof (window as any).performLeaveAction === "function") {
        return await (window as any).performLeaveAction();
      } else {
        (window as any).logBot?.(
          "[Node Eval Error] performLeaveAction function not found on window."
        );
        console.error(
          "[Node Eval Error] performLeaveAction function not found on window."
        );
        return false;
      }
    });
    log(`[leaveGoogleMeet] Browser leave action result: ${result}`);
    return result; // Return true if leave was attempted, false otherwise
  } catch (error: any) {
    log(
      `[leaveGoogleMeet] Error calling performLeaveAction in browser: ${error.message}`
    );
    return false;
  }
}
// --- ------------------------------------------------------- ---
