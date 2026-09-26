Implement a polished, scroll-driven animation on my website using Anime.js, based on the attached object images.

GOAL
Recreate the object and its transformation as a smooth, continuous animation whose progress is driven by the user's scroll position (like the hero on animejs.com). Treat the images as visual references for the starting state, intermediate poses, and ending state.

Inspect my existing website first. Match its framework, layout, and styling, and integrate the animation without replacing unrelated content. If the project is empty, scaffold a minimal Vite project and build a simple hero page around the animation, with at least one section after it.

CHOOSE THE APPROPRIATE APPROACH
Inspect the images and choose the simplest rendering approach that can convincingly reproduce the object:
- Use layered SVG for illustrated objects and transformations that work in two dimensions.
- Use Three.js with Anime.js for objects that require real depth, curved surfaces, changing perspective, or realistic lighting.
- Use separate image layers only if suitable assets exist and their movement does not expose missing surfaces.

Anime.js should control the animation timing and progression.

Do not assume that flattened images contain editable components. Create the necessary SVG shapes or procedural 3D geometry where practical. If essential assets cannot be recreated faithfully, explain the specific limitation before substituting a noticeably different design.

VISUAL FIDELITY
Preserve the reference object's silhouette, proportions, materials, colours, and identifiable components.
Give each moving component its own transform and an appropriate pivot point. Maintain consistent construction throughout the transformation.
Do not substitute a slideshow, crossfade, whole-image zoom, or rotation for the object's actual transformation.

ANIMATION
Build one coordinated, seekable Anime.js timeline.
Use the supplied images as pose guides, interpolating continuously between them. Do not treat the reference images as a complete frame sequence.
Use:
- Natural acceleration and deceleration.
- Subtle staggering between related components.
- Believable hinge, rotation, sliding, or assembly movement.
- A brief hold on the starting pose and on the final reveal.
- Restrained secondary motion where it improves the result.
Keep the camera stable unless the references require movement. Avoid unnecessary bouncing, jitter, abrupt transitions, and intersecting solid parts. Parts that haven't appeared yet must be hidden, not floating in place.

Seeking must be deterministic: jumping to any time, forwards or backwards, must produce exactly the same frame as playing to that time.

SCROLL-DRIVEN PLAYBACK
- Link the timeline to scroll with Anime.js onScroll (ScrollObserver) using smoothed sync (e.g. sync: 0.4), so it eases towards the scroll position instead of stepping with the mouse wheel.
- Place the animation in a tall scroll section (about 300–350vh) with a sticky, full-viewport inner container, so the object stays pinned while scrolling builds it.
- Map the section's scroll range (enter 'top top' → leave 'bottom bottom') to the full build: start pose at the top, finished object at the bottom. Scrolling up must reverse it smoothly.
- In scroll mode the timeline plays the build once and does not loop.
- On desktop, pin the hero copy beside the animation. On mobile, let the copy scroll normally, then pin the animation.
- Show a small progress indicator with clickable stage labels that smooth-scroll to each stage, and a "scroll" hint that fades out once scrolling starts.
- Release the pin cleanly into the following content when the build completes.
- Keep an optional autoplay mode (with a seamless loop that returns to the starting pose, matching position and motion at the boundary) for use without scroll.

WEBSITE INTEGRATION
Create a reusable, responsive component with a small API (play, pause, seek, destroy, and a scroll option). Keep animation styles scoped to the component. Avoid global CSS changes and duplicate dependencies.
Handle resizing (including refreshing the scroll observer), pause unnecessary work when offscreen or when the tab is hidden, and clean up timelines, scroll observers, listeners, and rendering resources when the component is removed.
Respect prefers-reduced-motion: remove the tall scroll section, show a strong static pose of the finished object with an optional play control, and switch modes if the preference changes.

PERFORMANCE
Aim for stable 60 fps on capable devices, including while scrolling, without promising it universally. Render only when the timeline changes. Keep geometry, effects, and animated elements economical. For 3D, cap rendering resolution appropriately for mobile devices.
Load required assets before starting so the object does not appear in incomplete pieces.

VERIFICATION AND DELIVERY
Implement the working animation, not just an explanation.
Run it in the browser and check:
- Visual similarity to the supplied references.
- Smooth movement through intermediate poses.
- Scroll position maps correctly to progress (e.g. 60% through the section = 60% built), smoothing works, and scrolling up reverses cleanly.
- Backward seeks produce the same frames as forward playback.
- Progress UI stays correct during holds where nothing moves.
- The pin releases correctly into the next section.
- Autoplay loop behaviour, if included.
- Desktop and mobile layout, with no horizontal scroll.
- Reduced-motion behaviour.
- Browser errors and integration issues.

Provide a working preview and identify the files changed. Briefly explain how to adjust scroll length, smoothing, duration, colours, and component size.
Clearly state any visual compromises. Do not claim that performance or behaviour was tested unless it actually was.
