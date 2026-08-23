package com.photonicomega.facilities.module.governance;

import com.photonicomega.facilities.module.governance.domain.SensitiveAction;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the wording of the sentences the approval gate shows when it refuses.
 *
 * <h3>Why this exists</h3>
 * When the gate refuses, the sentence it returns is the entire explanation the user
 * gets. There is no other feedback: the act did not happen, the screen did not change,
 * and the only thing distinguishing "you typed too short a reason" from "your role may
 * not do this" from "somebody already asked for this" is that string. The gate is also
 * the component asking people to trust it with the company's documents and contracts.
 *
 * <p>Six of those sentences were built with
 * {@code action.getLabel().toLowerCase(Locale.ROOT)}. That is correct for
 * "Terminate contract" and wrong for every label carrying an acronym, of which there
 * are five of seventeen - four naming AI and one naming IP. Administrators were told
 * "a request to delete ai provider is already awaiting approval" and "your role is not
 * permitted to request unblock ip address". A control that cannot spell the thing it is
 * refusing invites the reader to conclude it is broken and to go looking for a way
 * round it, which is the opposite of what a deny-by-default gate is for.
 *
 * <p>The duplicate-request sentence had a second fault on top of the first. It read
 * {@code "A request to " + label + " this item is already awaiting approval"}, but
 * every label already names its own object, so it came out as "A request to change ai
 * instructions this item is already awaiting approval" - observed verbatim in the
 * browser while verifying the AI Services screen.
 *
 * <h3>What is asserted</h3>
 * The per-action wording rules, and - separately - that no governance source file
 * lowercases a whole label again. The second assertion is the one that matters for
 * regression: the fault was not one bad sentence but one bad idiom copied to six
 * places, and a test that only checked {@link SensitiveAction#getLabelInSentence()}
 * would have gone green while all six callers stayed broken.
 */
class SensitiveActionWordingTest {

    /** Two or more consecutive capitals: AI, IP, OCR, DPO. */
    private static final Pattern ACRONYM = Pattern.compile("\\b[A-Z]{2,}\\b");

    @ParameterizedTest
    @EnumSource(SensitiveAction.class)
    @DisplayName("Every label reads as a lower-case verb phrase inside a sentence")
    void labelInSentenceStartsLowerCase(SensitiveAction action) {
        String phrase = action.getLabelInSentence();

        assertThat(phrase)
                .as("the phrase is dropped into the middle of a sentence, e.g. "
                    + "\"a written justification is required before <phrase> can be requested\"")
                .isNotBlank();
        assertThat(Character.isUpperCase(phrase.charAt(0)))
                .as("%s starts with a capital, so the sentence reads "
                    + "\"...required before Delete AI provider can be requested\"", phrase)
                .isFalse();
        assertThat(phrase.substring(1))
                .as("only the first character may be changed; the rest of the label is the "
                    + "author's own capitalisation and this method must not second-guess it")
                .isEqualTo(action.getLabel().substring(1));
    }

    @ParameterizedTest
    @EnumSource(SensitiveAction.class)
    @DisplayName("Acronyms in a label survive being put into a sentence")
    void acronymsAreNotFlattened(SensitiveAction action) {
        Matcher matcher = ACRONYM.matcher(action.getLabel());
        String phrase = action.getLabelInSentence();

        while (matcher.find()) {
            String acronym = matcher.group();
            assertThat(phrase)
                    .as("%s must keep the acronym %s; lower-casing the whole label turns "
                        + "\"Delete AI provider\" into \"delete ai provider\"",
                        action.name(), acronym)
                    .contains(acronym);
        }
    }

    @Test
    @DisplayName("The acronym-bearing labels read correctly, spelled out")
    void theAcronymCasesAreSpelledOut() {
        // Named explicitly rather than left to the sweep above, so the intended output is
        // written down somewhere a reader can check against without running anything.
        assertThat(SensitiveAction.AI_PROVIDER_DELETE.getLabelInSentence())
                .isEqualTo("delete AI provider");
        assertThat(SensitiveAction.AI_INSTRUCTION_UPDATE.getLabelInSentence())
                .isEqualTo("change AI instructions");
        assertThat(SensitiveAction.AI_INSTRUCTION_ROLLBACK.getLabelInSentence())
                .isEqualTo("roll back AI instructions");
        assertThat(SensitiveAction.AI_PROVIDER_SET_DEFAULT.getLabelInSentence())
                .isEqualTo("change the default AI provider");
        assertThat(SensitiveAction.IP_UNBLOCK.getLabelInSentence())
                .isEqualTo("unblock IP address");

        // And the plain ones still read as they always did.
        assertThat(SensitiveAction.CONTRACT_TERMINATE.getLabelInSentence())
                .isEqualTo("terminate contract");
        assertThat(SensitiveAction.DOCUMENT_DISPOSE.getLabelInSentence())
                .isEqualTo("dispose of document");
    }

    @Test
    @DisplayName("No governance source lowercases a whole action label")
    void noSourceFlattensALabel() throws IOException {
        Path governance = Path.of("src/main/java/com/photonicomega/facilities/module/governance");
        assertThat(governance)
                .as("if the package moves, this test must be pointed at it rather than "
                    + "quietly passing over an empty file list")
                .exists();

        List<String> offenders;
        try (Stream<Path> sources = Files.walk(governance)) {
            offenders = sources
                    .filter(p -> p.toString().endsWith(".java"))
                    .flatMap(SensitiveActionWordingTest::flatteningLines)
                    .toList();
        }

        assertThat(offenders)
                .as("use getLabelInSentence() instead. Lower-casing the whole label loses "
                    + "the acronyms in five of the seventeen labels, and these strings are "
                    + "shown to the person the gate has just refused")
                .isEmpty();
    }

    private static Stream<String> flatteningLines(Path file) {
        List<String> lines;
        try {
            lines = Files.readAllLines(file);
        } catch (IOException e) {
            throw new IllegalStateException("Could not read " + file, e);
        }
        // The label is often on its own line, split from `.toLowerCase(...)` by the
        // formatter, so match either half rather than the whole expression.
        return Stream.iterate(0, i -> i + 1)
                .limit(lines.size())
                .filter(i -> {
                    String line = lines.get(i);
                    String trimmed = line.trim();
                    // Comments discuss the idiom by name - this test's own explanation of
                    // the fault is written in one - so only real code counts.
                    if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) {
                        return false;
                    }
                    if (!line.contains("getLabel()")) {
                        return false;
                    }
                    String rest = line.substring(line.indexOf("getLabel()"));
                    boolean sameLine = rest.contains("toLowerCase");
                    boolean nextLine = i + 1 < lines.size()
                            && lines.get(i + 1).trim().toLowerCase(Locale.ROOT).startsWith(".tolowercase");
                    return sameLine || nextLine;
                })
                .map(i -> file.getFileName() + ":" + (i + 1) + "  " + lines.get(i).trim());
    }
}
