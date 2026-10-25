SONGPAD
A lyrics notepad that listens to you sing or hum, finds the notes, and suggests keys and chord
progressions. It also finds keys that fit your voice, shows guitar shapes with capo advice,
and backs up everything to one file. It is a real app: no website and no internet needed.


GET THE WINDOWS PROGRAM AND THE ANDROID APP (free, about 15 minutes, one time)

GitHub will build both for you. You are not hosting anything. GitHub just runs the build.

1. Make a free account at github.com.
2. Click the + at the top right, then New repository. Name it songpad. Choose Private. Create it.
3. On the new repository page click "uploading an existing file". Open the unzipped songpad-app
   folder, select everything inside it, and drag it into the browser. Click Commit changes.
4. The build needs a hidden folder that web upload can skip. Check: does your repo show a folder
   named .github? If not, click Add file > Create new file, type this exact name:
       .github/workflows/build.yml
   Paste in everything from the file "build-workflow-copy-this.yml" from the zip. Commit.
5. Click the Actions tab. You should see "Build Songpad" running. If not, click it in the
   left list, then Run workflow. It takes about 5 to 10 minutes.
6. When it finishes, click the run, scroll to Artifacts at the bottom, and download
   songpad-windows and songpad-android. Each is a zip with your file inside.

INSTALL
- Windows: unzip songpad-windows. Run "Songpad Setup" to install, or "Songpad-portable" to run
  it with no install. Windows may say "unknown publisher". Click More info, then Run anyway.
  If the microphone is silent: Settings > Privacy & security > Microphone > allow desktop apps.
- Android: unzip songpad-android and copy app-debug.apk to the phone. Open it. Android will ask
  to allow installs from this source. Allow it. If Play Protect warns about an unknown app,
  choose Install anyway. The first time you record, allow the microphone.

IF THE BUILD FAILS
Click the red run, open the failed step, and copy the last 30 lines of the log to Claude.

WINDOWS WITHOUT AN ACCOUNT (quick option)
Double-click Songpad-QuickStart.bat. It opens Songpad in its own window using Edge or Chrome.
It is not an installed program and Windows may ask for the microphone each time.


GOOD TO KNOW
- Click a chord anywhere to hear it. Double-click (or double-tap) to add it to your lyrics.
  The round button on a chord progression plays the whole thing.
- The bar under the title has Record, Play, tempo, and Click / Drums / Count-in. The Beat tab
  is a step sequencer with 29 presets sorted by genre and mood. If you record with the click or
  drums on, wear headphones, or Songpad will hear the beat through the microphone.
- Notes and recordings are stored on the device. They are not uploaded anywhere.
- Press "Back up all" in the notes list now and then. It saves one file you can keep or move to
  another device, where "Restore" loads it. Restoring never overwrites a note that is newer.
- Detection follows one voice or one instrument line at a time. Strummed chords are not
  split into notes.
