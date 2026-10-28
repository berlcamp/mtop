/* eslint no-unused-expressions: off */
/* eslint @typescript-eslint/no-unused-expressions: off */
async (page) => {
  const cases = [
    {
      name: "pending application (current session is read-only)",
      path: "/dashboard/applications/2abc1e7f-1fdc-4b59-a03e-509ea8a1fc45",
      editable: false,
    },
    {
      name: "read-only granted application with print actions",
      path: "/dashboard/applications/7eca7fc8-e375-44dc-a181-3b5ad1734f89",
      editable: false,
    },
  ]
  const widths = [320, 360, 375, 390, 393, 430, 768, 1024, 1440]
  const results = []

  for (const application of cases) {
    await page.goto(`http://localhost:3000${application.path}`, {
      waitUntil: "domcontentloaded",
    })
    await page.locator("main h1").waitFor()

    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 })
      const result = await page.evaluate((expected) => {
        const main = document.querySelector("main")
        const topbar = main.previousElementSibling
        const title = main.querySelector("h1")
        const header = title?.parentElement?.parentElement
        const photosCard = [...main.querySelectorAll('[data-slot="card"]')]
          .find((card) => card.innerText.includes("Photos & Card Details"))
        const photoRow = photosCard?.querySelector(".flex.flex-wrap.gap-8")
        const rect = (element) => {
          const box = element.getBoundingClientRect()
          return {
            left: Number(box.left.toFixed(2)),
            right: Number(box.right.toFixed(2)),
            width: Number(box.width.toFixed(2)),
            height: Number(box.height.toFixed(2)),
          }
        }
        const mainBox = main.getBoundingClientRect()
        const mainStyle = getComputedStyle(main)
        const contentLeft = mainBox.left + parseFloat(mainStyle.paddingLeft)
        const contentRight = mainBox.left + main.clientWidth - parseFloat(mainStyle.paddingRight)
        const cards = [...main.querySelectorAll('[data-slot="card"]')]
          .map((card) => ({ text: card.querySelector('[data-slot="card-title"]')?.innerText ?? "card", ...rect(card) }))
        const controls = [...main.querySelectorAll("button, a, input, textarea, select")]
          .filter((element) => element.getBoundingClientRect().width > 0)
          .map((element) => {
            const box = element.getBoundingClientRect()
            const inViewport = box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth
            const hit = inViewport
              ? document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
              : null
            return {
              text: (element.innerText || element.getAttribute("aria-label") || element.getAttribute("placeholder") || element.id).slice(0, 60),
              hitTestable: !inViewport || hit === element || element.contains(hit),
              ...rect(element),
            }
          })
        const frames = [...(photoRow?.children ?? [])].map((slot) => {
          const frame = slot.querySelector('[class*="aspect-"]')
          return frame ? rect(frame) : null
        }).filter(Boolean)
        const mainCanScrollVertically = main.scrollHeight > main.clientHeight
        main.scrollTop = 1
        const topbarChildren = [...(topbar?.children ?? [])]
          .filter((element) => element.getBoundingClientRect().width > 0)
          .map(rect)
        const topbarNoOverlap = topbarChildren.every((child, index) =>
          index === 0 || topbarChildren[index - 1].right <= child.left + 0.5
        )

        return {
          viewport: innerWidth,
          documentClientWidth: document.documentElement.clientWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          mainClientWidth: main.clientWidth,
          mainScrollWidth: main.scrollWidth,
          mainCanScrollVertically,
          mainVerticalScrollResponded: main.scrollTop > 0,
          topbarChildren,
          topbarNoOverlap,
          contentLeft: Number(contentLeft.toFixed(2)),
          contentRight: Number(contentRight.toFixed(2)),
          header: header ? rect(header) : null,
          headerDirection: header ? getComputedStyle(header).flexDirection : null,
          statusBadges: [...(header?.querySelectorAll("span") ?? [])]
            .filter((element) => /^(For Verification|Granted)$/.test(element.innerText.trim()))
            .map((element) => ({ text: element.innerText.trim(), ...rect(element) })),
          headerActions: [...main.querySelectorAll('a, button, [role="status"]')]
            .filter((element) => /Franchise record|Print Franchise Card|Print Confirmation Slip|For Verification|Granted/.test(element.innerText || ""))
            .map((element) => ({ text: element.innerText, ...rect(element) })),
          cards,
          controls,
          photoGap: photoRow ? getComputedStyle(photoRow).columnGap : null,
          photoFrames: frames,
          unitUploadVisible: [...main.querySelectorAll("button")].some((button) => button.innerText.includes("Upload Image") && button.getBoundingClientRect().width > 0),
          ownerDriverCaptureCount: [...main.querySelectorAll("button")].filter((button) => button.innerText.trim() === "Capture").length,
          driverNameInputVisible: !!main.querySelector('#driver_name')?.getBoundingClientRect().width,
          editable: expected.editable,
        }
      }, application)

      const failures = []
      if (result.documentScrollWidth !== result.documentClientWidth) failures.push("document horizontal overflow")
      if (result.bodyScrollWidth > result.documentClientWidth) failures.push("body horizontal overflow")
      if (result.mainScrollWidth > result.mainClientWidth) failures.push("dashboard main horizontal overflow")
      if (!result.mainCanScrollVertically || !result.mainVerticalScrollResponded) failures.push("dashboard main vertical scrolling unavailable")
      if (!result.topbarNoOverlap) failures.push("topbar controls overlap")
      if (!result.header || result.header.left < result.contentLeft - 0.5 || result.header.right > result.contentRight + 0.5) failures.push("application header outside content area")
      if (result.headerDirection !== (width < 1280 ? "column" : "row")) failures.push("application header does not reposition at constrained widths")
      if (!result.statusBadges.length || result.statusBadges.some((badge) => badge.left < result.contentLeft - 0.5 || badge.right > result.contentRight + 0.5)) failures.push("application status badge missing or outside content area")
      if (result.cards.some((card) => card.left < result.contentLeft - 0.5 || card.right > result.contentRight + 0.5)) failures.push("card outside content area")
      if (result.controls.some((control) => control.left < result.contentLeft - 0.5 || control.right > result.contentRight + 0.5)) failures.push("control outside content area")
      if (result.controls.some((control) => !control.hitTestable)) failures.push("control hit area is obstructed")
      if (result.photoFrames.length !== 3 || result.photoFrames.some((frame) => Math.abs(frame.width - 128) > 0.5 || Math.abs(frame.height - 170.67) > 0.6)) failures.push("photo frame dimensions changed")
      if (result.photoGap !== "32px") failures.push("photo slot gap changed")
      if (application.editable && (!result.unitUploadVisible || result.ownerDriverCaptureCount !== 2)) failures.push("photo actions unavailable")
      if (!application.editable && (result.unitUploadVisible || result.ownerDriverCaptureCount !== 0)) failures.push("read-only photo actions changed")
      if (result.driverNameInputVisible !== application.editable) failures.push("driver edit/read-only state changed")

      results.push({
        application: application.name,
        viewport: result.viewport,
        document: [result.documentClientWidth, result.documentScrollWidth],
        main: [result.mainClientWidth, result.mainScrollWidth],
        headerDirection: result.headerDirection,
        header: result.header,
        topbarChildren: result.topbarChildren,
        statusBadges: result.statusBadges,
        cards: result.cards,
        photoGap: result.photoGap,
        photoFrames: result.photoFrames,
        editable: result.driverNameInputVisible,
        verticalScroll: result.mainVerticalScrollResponded,
        failures,
      })
      if (failures.length) {
        throw new Error(`${application.name} at ${width}px: ${failures.join(", ")}\n${JSON.stringify(result)}`)
      }
    }
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('button[aria-label="Search franchises"]').click()
  const searchDialog = page.getByRole("dialog")
  await searchDialog.waitFor({ state: "visible" })
  await page.keyboard.press("Escape")
  await searchDialog.waitFor({ state: "hidden" })

  await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  const sidebarDialog = page.getByRole("dialog")
  await sidebarDialog.waitFor({ state: "visible" })
  await page.keyboard.press("Escape")
  await sidebarDialog.waitFor({ state: "hidden" })

  return { viewportMatrix: results, searchDialogOpens: true, mobileSidebarOpens: true }
}
