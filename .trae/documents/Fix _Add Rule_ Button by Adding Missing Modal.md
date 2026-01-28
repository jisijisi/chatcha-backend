I have identified the issue: the **Add Rule** button is not working because the popup modal (`speech-modal`) it tries to open is completely missing from the `admin.html` file. The JavaScript logic exists and is correct, but there is no HTML for it to interact with.

Here is the plan to fix it:

1. **Edit** **`frontend/admin.html`**:

   * I will add the missing `speech-modal` HTML structure at the bottom of the file (alongside other modals).

   * The modal will include the following fields required by the JavaScript:

     * **Pattern/Word**: Input field (`id="speech-pattern"`)

     * **Replacement**: Input field (`id="speech-replacement"`)

     * **Type**: Dropdown (`id="speech-type"`) with options: General, Acronym, Brand, Unit.

     * **Description**: Text area (`id="speech-description"`)

     * **Action Buttons**: Cancel (`id="speech-modal-cancel"`) and Save (`id="speech-modal-save"`)

2. **Verify**:

   * After adding the code, the "Add Rule" button should successfully open the modal, allowing you to add new pronunciation rules.

