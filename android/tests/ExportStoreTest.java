import io.github.humdrfgry.unlockmusic.ExportStore;
import java.io.File;
import java.nio.file.Files;
import java.util.Arrays;

/** Dependency-free JVM checks for the native export staging layer. */
public class ExportStoreTest {
    interface Checked { void run() throws Exception; }
    static int count = 0;
    static void test(String name, Checked fn) throws Exception { fn.run(); count++; System.out.println("PASS " + name); }
    static void fails(Checked fn) throws Exception {
        try { fn.run(); } catch (java.io.IOException e) { return; }
        throw new AssertionError("Expected failure");
    }
    public static void main(String[] args) throws Exception {
        File dir = Files.createTempDirectory("unlock-export-test-").toFile();
        ExportStore s = new ExportStore(dir);
        test("zero and oversized exports rejected", () -> { fails(() -> s.begin("x", "audio/wav", 0)); fails(() -> s.begin("x", "audio/wav", ExportStore.MAX_BYTES + 1)); });
        test("path and reserved names sanitized", () -> {
            assert !ExportStore.safeName("../../a.mp3").contains("/");
            assert ExportStore.safeName("CON.mp3").equals("_CON.mp3");
            assert ExportStore.safeName("曲".repeat(200) + ".flac").getBytes("UTF-8").length < 220;
            assert ExportStore.safeName("曲".repeat(200) + ".flac").endsWith(".flac");
        });
        test("append, finish and exact output bytes", () -> {
            String id = s.begin("测试.wav", "audio/wav", 4);
            s.append(id, new byte[]{1,2}); s.append(id, new byte[]{3,4});
            assert Arrays.equals(Files.readAllBytes(s.finish(id).toPath()), new byte[]{1,2,3,4});
            assert s.getName(id).equals("测试.wav"); assert s.getMime(id).equals("audio/wav"); s.abort(id);
        });
        test("wrong token and concurrent export rejected", () -> {
            String id = s.begin("a", "bad/mime", 3); fails(() -> s.append("wrong", new byte[]{1}));
            fails(() -> s.begin("b", "audio/wav", 4)); assert s.getMime(id).equals("application/octet-stream"); s.abort(id);
        });
        test("incomplete, overrun and oversized chunks rejected", () -> {
            String id = s.begin("a", "audio/wav", 3); s.append(id,new byte[]{1});
            fails(() -> s.finish(id)); fails(() -> s.append(id,new byte[]{2,3,4})); fails(() -> s.append(id,new byte[65537])); s.abort(id);
        });
        test("cannot append or finish twice", () -> {
            String id=s.begin("a", "audio/wav", 1); s.append(id,new byte[]{1}); s.finish(id);
            fails(() -> s.append(id,new byte[]{2})); fails(() -> s.finish(id)); s.abort(id);
        });
        test("cancel cleans temporary files", () -> {
            String id=s.begin("a", "audio/wav", 2); s.append(id,new byte[]{1}); s.abort(id); assert dir.list().length==0;
        });
        test("next launch cleans stale private export only", () -> {
            Files.write(new File(dir,"export-leftover.tmp").toPath(),new byte[]{1});
            Files.write(new File(dir,"unrelated.txt").toPath(),new byte[]{1});
            new ExportStore(dir).close(); assert !new File(dir,"export-leftover.tmp").exists(); assert new File(dir,"unrelated.txt").exists();
        });
        s.close(); for(File f:dir.listFiles())f.delete(); dir.delete();
        System.out.println(count + " native staging tests passed");
    }
}
