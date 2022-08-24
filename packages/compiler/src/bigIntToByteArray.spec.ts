import { expect } from 'chai';
import 'mocha';
import { bigIntToByteArray, byteArrayToBigInt } from './utils'

// tables generated via powershell in order to ensure .NET BigInteger compat
const positiveValueTests = [
    { value: 0n, expected: "00" },
    { value: 1n, expected: "01" },
    { value: 2n, expected: "02" },
    { value: 3n, expected: "03" },
    { value: 4n, expected: "04" },
    { value: 5n, expected: "05" },
    { value: 7n, expected: "07" },
    { value: 8n, expected: "08" },
    { value: 9n, expected: "09" },
    { value: 15n, expected: "0F" },
    { value: 16n, expected: "10" },
    { value: 17n, expected: "11" },
    { value: 31n, expected: "1F" },
    { value: 32n, expected: "20" },
    { value: 33n, expected: "21" },
    { value: 63n, expected: "3F" },
    { value: 64n, expected: "40" },
    { value: 65n, expected: "41" },
    { value: 127n, expected: "7F" },
    { value: 128n, expected: "8000" },
    { value: 129n, expected: "8100" },
    { value: 255n, expected: "FF00" },
    { value: 256n, expected: "0001" },
    { value: 257n, expected: "0101" },
    { value: 511n, expected: "FF01" },
    { value: 512n, expected: "0002" },
    { value: 513n, expected: "0102" },
    { value: 1023n, expected: "FF03" },
    { value: 1024n, expected: "0004" },
    { value: 1025n, expected: "0104" },
    { value: 2047n, expected: "FF07" },
    { value: 2048n, expected: "0008" },
    { value: 2049n, expected: "0108" },
    { value: 4095n, expected: "FF0F" },
    { value: 4096n, expected: "0010" },
    { value: 4097n, expected: "0110" },
    { value: 8191n, expected: "FF1F" },
    { value: 8192n, expected: "0020" },
    { value: 8193n, expected: "0120" },
    { value: 16383n, expected: "FF3F" },
    { value: 16384n, expected: "0040" },
    { value: 16385n, expected: "0140" },
    { value: 32767n, expected: "FF7F" },
    { value: 32768n, expected: "008000" },
    { value: 32769n, expected: "018000" },
    { value: 65535n, expected: "FFFF00" },
    { value: 65536n, expected: "000001" },
    { value: 65537n, expected: "010001" },
    { value: 131071n, expected: "FFFF01" },
    { value: 131072n, expected: "000002" },
    { value: 131073n, expected: "010002" },
    { value: 262143n, expected: "FFFF03" },
    { value: 262144n, expected: "000004" },
    { value: 262145n, expected: "010004" },
    { value: 524287n, expected: "FFFF07" },
    { value: 524288n, expected: "000008" },
    { value: 524289n, expected: "010008" },
    { value: 1048575n, expected: "FFFF0F" },
    { value: 1048576n, expected: "000010" },
    { value: 1048577n, expected: "010010" },
    { value: 2097151n, expected: "FFFF1F" },
    { value: 2097152n, expected: "000020" },
    { value: 2097153n, expected: "010020" },
    { value: 4194303n, expected: "FFFF3F" },
    { value: 4194304n, expected: "000040" },
    { value: 4194305n, expected: "010040" },
    { value: 8388607n, expected: "FFFF7F" },
    { value: 8388608n, expected: "00008000" },
    { value: 8388609n, expected: "01008000" },
    { value: 16777215n, expected: "FFFFFF00" },
    { value: 16777216n, expected: "00000001" },
    { value: 16777217n, expected: "01000001" },
    { value: 33554431n, expected: "FFFFFF01" },
    { value: 33554432n, expected: "00000002" },
    { value: 33554433n, expected: "01000002" },
    { value: 67108863n, expected: "FFFFFF03" },
    { value: 67108864n, expected: "00000004" },
    { value: 67108865n, expected: "01000004" },
    { value: 134217727n, expected: "FFFFFF07" },
    { value: 134217728n, expected: "00000008" },
    { value: 134217729n, expected: "01000008" },
    { value: 268435455n, expected: "FFFFFF0F" },
    { value: 268435456n, expected: "00000010" },
    { value: 268435457n, expected: "01000010" },
    { value: 536870911n, expected: "FFFFFF1F" },
    { value: 536870912n, expected: "00000020" },
    { value: 536870913n, expected: "01000020" },
    { value: 1073741823n, expected: "FFFFFF3F" },
    { value: 1073741824n, expected: "00000040" },
    { value: 1073741825n, expected: "01000040" },
    { value: 2147483647n, expected: "FFFFFF7F" },
    { value: 2147483648n, expected: "0000008000" },
    { value: 2147483649n, expected: "0100008000" },
    { value: 4294967295n, expected: "FFFFFFFF00" },
    { value: 4294967296n, expected: "0000000001" },
    { value: 4294967297n, expected: "0100000001" },
    { value: 8589934591n, expected: "FFFFFFFF01" },
    { value: 8589934592n, expected: "0000000002" },
    { value: 8589934593n, expected: "0100000002" },
    { value: 17179869183n, expected: "FFFFFFFF03" },
    { value: 17179869184n, expected: "0000000004" },
    { value: 17179869185n, expected: "0100000004" },
    { value: 34359738367n, expected: "FFFFFFFF07" },
    { value: 34359738368n, expected: "0000000008" },
    { value: 34359738369n, expected: "0100000008" },
    { value: 68719476735n, expected: "FFFFFFFF0F" },
    { value: 68719476736n, expected: "0000000010" },
    { value: 68719476737n, expected: "0100000010" },
    { value: 137438953471n, expected: "FFFFFFFF1F" },
    { value: 137438953472n, expected: "0000000020" },
    { value: 137438953473n, expected: "0100000020" },
    { value: 274877906943n, expected: "FFFFFFFF3F" },
    { value: 274877906944n, expected: "0000000040" },
    { value: 274877906945n, expected: "0100000040" },
    { value: 549755813887n, expected: "FFFFFFFF7F" },
    { value: 549755813888n, expected: "000000008000" },
    { value: 549755813889n, expected: "010000008000" },
    { value: 1099511627775n, expected: "FFFFFFFFFF00" },
    { value: 1099511627776n, expected: "000000000001" },
    { value: 1099511627777n, expected: "010000000001" },
    { value: 2199023255551n, expected: "FFFFFFFFFF01" },
    { value: 2199023255552n, expected: "000000000002" },
    { value: 2199023255553n, expected: "010000000002" },
    { value: 4398046511103n, expected: "FFFFFFFFFF03" },
    { value: 4398046511104n, expected: "000000000004" },
    { value: 4398046511105n, expected: "010000000004" },
    { value: 8796093022207n, expected: "FFFFFFFFFF07" },
    { value: 8796093022208n, expected: "000000000008" },
    { value: 8796093022209n, expected: "010000000008" },
    { value: 17592186044415n, expected: "FFFFFFFFFF0F" },
    { value: 17592186044416n, expected: "000000000010" },
    { value: 17592186044417n, expected: "010000000010" },
    { value: 35184372088831n, expected: "FFFFFFFFFF1F" },
    { value: 35184372088832n, expected: "000000000020" },
    { value: 35184372088833n, expected: "010000000020" },
    { value: 70368744177663n, expected: "FFFFFFFFFF3F" },
    { value: 70368744177664n, expected: "000000000040" },
    { value: 70368744177665n, expected: "010000000040" },
    { value: 140737488355327n, expected: "FFFFFFFFFF7F" },
    { value: 140737488355328n, expected: "00000000008000" },
    { value: 140737488355329n, expected: "01000000008000" },
    { value: 281474976710655n, expected: "FFFFFFFFFFFF00" },
    { value: 281474976710656n, expected: "00000000000001" },
    { value: 281474976710657n, expected: "01000000000001" },
    { value: 562949953421311n, expected: "FFFFFFFFFFFF01" },
    { value: 562949953421312n, expected: "00000000000002" },
    { value: 562949953421313n, expected: "01000000000002" },
    { value: 1125899906842623n, expected: "FFFFFFFFFFFF03" },
    { value: 1125899906842624n, expected: "00000000000004" },
    { value: 1125899906842625n, expected: "01000000000004" },
    { value: 2251799813685247n, expected: "FFFFFFFFFFFF07" },
    { value: 2251799813685248n, expected: "00000000000008" },
    { value: 2251799813685249n, expected: "01000000000008" },
    { value: 4503599627370495n, expected: "FFFFFFFFFFFF0F" },
    { value: 4503599627370496n, expected: "00000000000010" },
    { value: 4503599627370497n, expected: "01000000000010" },
    { value: 9007199254740991n, expected: "FFFFFFFFFFFF1F" },
    { value: 9007199254740992n, expected: "00000000000020" },
    { value: 9007199254740993n, expected: "01000000000020" },
    { value: 18014398509481983n, expected: "FFFFFFFFFFFF3F" },
    { value: 18014398509481984n, expected: "00000000000040" },
    { value: 18014398509481985n, expected: "01000000000040" },
    { value: 36028797018963967n, expected: "FFFFFFFFFFFF7F" },
    { value: 36028797018963968n, expected: "0000000000008000" },
    { value: 36028797018963969n, expected: "0100000000008000" },
    { value: 72057594037927935n, expected: "FFFFFFFFFFFFFF00" },
    { value: 72057594037927936n, expected: "0000000000000001" },
    { value: 72057594037927937n, expected: "0100000000000001" },
    { value: 144115188075855871n, expected: "FFFFFFFFFFFFFF01" },
    { value: 144115188075855872n, expected: "0000000000000002" },
    { value: 144115188075855873n, expected: "0100000000000002" },
    { value: 288230376151711743n, expected: "FFFFFFFFFFFFFF03" },
    { value: 288230376151711744n, expected: "0000000000000004" },
    { value: 288230376151711745n, expected: "0100000000000004" },
    { value: 576460752303423487n, expected: "FFFFFFFFFFFFFF07" },
    { value: 576460752303423488n, expected: "0000000000000008" },
    { value: 576460752303423489n, expected: "0100000000000008" },
    { value: 1152921504606846975n, expected: "FFFFFFFFFFFFFF0F" },
    { value: 1152921504606846976n, expected: "0000000000000010" },
    { value: 1152921504606846977n, expected: "0100000000000010" },
    { value: 2305843009213693951n, expected: "FFFFFFFFFFFFFF1F" },
    { value: 2305843009213693952n, expected: "0000000000000020" },
    { value: 2305843009213693953n, expected: "0100000000000020" },
    { value: 4611686018427387903n, expected: "FFFFFFFFFFFFFF3F" },
    { value: 4611686018427387904n, expected: "0000000000000040" },
    { value: 4611686018427387905n, expected: "0100000000000040" },
    { value: 9223372036854775807n, expected: "FFFFFFFFFFFFFF7F" },
    { value: 9223372036854775808n, expected: "000000000000008000" },
    { value: 9223372036854775809n, expected: "010000000000008000" },
    { value: 18446744073709551615n, expected: "FFFFFFFFFFFFFFFF00" },
    { value: 18446744073709551616n, expected: "000000000000000001" },
    { value: 18446744073709551617n, expected: "010000000000000001" },
];

const negativeValueTests = [
    { value: -1n, expected: "FF" },
    { value: -2n, expected: "FE" },
    { value: -3n, expected: "FD" },
    { value: -4n, expected: "FC" },
    { value: -5n, expected: "FB" },
    { value: -7n, expected: "F9" },
    { value: -8n, expected: "F8" },
    { value: -9n, expected: "F7" },
    { value: -15n, expected: "F1" },
    { value: -16n, expected: "F0" },
    { value: -17n, expected: "EF" },
    { value: -31n, expected: "E1" },
    { value: -32n, expected: "E0" },
    { value: -33n, expected: "DF" },
    { value: -63n, expected: "C1" },
    { value: -64n, expected: "C0" },
    { value: -65n, expected: "BF" },
    { value: -127n, expected: "81" },
    { value: -128n, expected: "80" },
    { value: -129n, expected: "7FFF" },
    { value: -255n, expected: "01FF" },
    { value: -256n, expected: "00FF" },
    { value: -257n, expected: "FFFE" },
    { value: -511n, expected: "01FE" },
    { value: -512n, expected: "00FE" },
    { value: -513n, expected: "FFFD" },
    { value: -1023n, expected: "01FC" },
    { value: -1024n, expected: "00FC" },
    { value: -1025n, expected: "FFFB" },
    { value: -2047n, expected: "01F8" },
    { value: -2048n, expected: "00F8" },
    { value: -2049n, expected: "FFF7" },
    { value: -4095n, expected: "01F0" },
    { value: -4096n, expected: "00F0" },
    { value: -4097n, expected: "FFEF" },
    { value: -8191n, expected: "01E0" },
    { value: -8192n, expected: "00E0" },
    { value: -8193n, expected: "FFDF" },
    { value: -16383n, expected: "01C0" },
    { value: -16384n, expected: "00C0" },
    { value: -16385n, expected: "FFBF" },
    { value: -32767n, expected: "0180" },
    { value: -32768n, expected: "0080" },
    { value: -32769n, expected: "FF7FFF" },
    { value: -65535n, expected: "0100FF" },
    { value: -65536n, expected: "0000FF" },
    { value: -65537n, expected: "FFFFFE" },
    { value: -131071n, expected: "0100FE" },
    { value: -131072n, expected: "0000FE" },
    { value: -131073n, expected: "FFFFFD" },
    { value: -262143n, expected: "0100FC" },
    { value: -262144n, expected: "0000FC" },
    { value: -262145n, expected: "FFFFFB" },
    { value: -524287n, expected: "0100F8" },
    { value: -524288n, expected: "0000F8" },
    { value: -524289n, expected: "FFFFF7" },
    { value: -1048575n, expected: "0100F0" },
    { value: -1048576n, expected: "0000F0" },
    { value: -1048577n, expected: "FFFFEF" },
    { value: -2097151n, expected: "0100E0" },
    { value: -2097152n, expected: "0000E0" },
    { value: -2097153n, expected: "FFFFDF" },
    { value: -4194303n, expected: "0100C0" },
    { value: -4194304n, expected: "0000C0" },
    { value: -4194305n, expected: "FFFFBF" },
    { value: -8388607n, expected: "010080" },
    { value: -8388608n, expected: "000080" },
    { value: -8388609n, expected: "FFFF7FFF" },
    { value: -16777215n, expected: "010000FF" },
    { value: -16777216n, expected: "000000FF" },
    { value: -16777217n, expected: "FFFFFFFE" },
    { value: -33554431n, expected: "010000FE" },
    { value: -33554432n, expected: "000000FE" },
    { value: -33554433n, expected: "FFFFFFFD" },
    { value: -67108863n, expected: "010000FC" },
    { value: -67108864n, expected: "000000FC" },
    { value: -67108865n, expected: "FFFFFFFB" },
    { value: -134217727n, expected: "010000F8" },
    { value: -134217728n, expected: "000000F8" },
    { value: -134217729n, expected: "FFFFFFF7" },
    { value: -268435455n, expected: "010000F0" },
    { value: -268435456n, expected: "000000F0" },
    { value: -268435457n, expected: "FFFFFFEF" },
    { value: -536870911n, expected: "010000E0" },
    { value: -536870912n, expected: "000000E0" },
    { value: -536870913n, expected: "FFFFFFDF" },
    { value: -1073741823n, expected: "010000C0" },
    { value: -1073741824n, expected: "000000C0" },
    { value: -1073741825n, expected: "FFFFFFBF" },
    { value: -2147483647n, expected: "01000080" },
    { value: -2147483648n, expected: "00000080" },
    { value: -2147483649n, expected: "FFFFFF7FFF" },
    { value: -4294967295n, expected: "01000000FF" },
    { value: -4294967296n, expected: "00000000FF" },
    { value: -4294967297n, expected: "FFFFFFFFFE" },
    { value: -8589934591n, expected: "01000000FE" },
    { value: -8589934592n, expected: "00000000FE" },
    { value: -8589934593n, expected: "FFFFFFFFFD" },
    { value: -17179869183n, expected: "01000000FC" },
    { value: -17179869184n, expected: "00000000FC" },
    { value: -17179869185n, expected: "FFFFFFFFFB" },
    { value: -34359738367n, expected: "01000000F8" },
    { value: -34359738368n, expected: "00000000F8" },
    { value: -34359738369n, expected: "FFFFFFFFF7" },
    { value: -68719476735n, expected: "01000000F0" },
    { value: -68719476736n, expected: "00000000F0" },
    { value: -68719476737n, expected: "FFFFFFFFEF" },
    { value: -137438953471n, expected: "01000000E0" },
    { value: -137438953472n, expected: "00000000E0" },
    { value: -137438953473n, expected: "FFFFFFFFDF" },
    { value: -274877906943n, expected: "01000000C0" },
    { value: -274877906944n, expected: "00000000C0" },
    { value: -274877906945n, expected: "FFFFFFFFBF" },
    { value: -549755813887n, expected: "0100000080" },
    { value: -549755813888n, expected: "0000000080" },
    { value: -549755813889n, expected: "FFFFFFFF7FFF" },
    { value: -1099511627775n, expected: "0100000000FF" },
    { value: -1099511627776n, expected: "0000000000FF" },
    { value: -1099511627777n, expected: "FFFFFFFFFFFE" },
    { value: -2199023255551n, expected: "0100000000FE" },
    { value: -2199023255552n, expected: "0000000000FE" },
    { value: -2199023255553n, expected: "FFFFFFFFFFFD" },
    { value: -4398046511103n, expected: "0100000000FC" },
    { value: -4398046511104n, expected: "0000000000FC" },
    { value: -4398046511105n, expected: "FFFFFFFFFFFB" },
    { value: -8796093022207n, expected: "0100000000F8" },
    { value: -8796093022208n, expected: "0000000000F8" },
    { value: -8796093022209n, expected: "FFFFFFFFFFF7" },
    { value: -17592186044415n, expected: "0100000000F0" },
    { value: -17592186044416n, expected: "0000000000F0" },
    { value: -17592186044417n, expected: "FFFFFFFFFFEF" },
    { value: -35184372088831n, expected: "0100000000E0" },
    { value: -35184372088832n, expected: "0000000000E0" },
    { value: -35184372088833n, expected: "FFFFFFFFFFDF" },
    { value: -70368744177663n, expected: "0100000000C0" },
    { value: -70368744177664n, expected: "0000000000C0" },
    { value: -70368744177665n, expected: "FFFFFFFFFFBF" },
    { value: -140737488355327n, expected: "010000000080" },
    { value: -140737488355328n, expected: "000000000080" },
    { value: -140737488355329n, expected: "FFFFFFFFFF7FFF" },
    { value: -281474976710655n, expected: "010000000000FF" },
    { value: -281474976710656n, expected: "000000000000FF" },
    { value: -281474976710657n, expected: "FFFFFFFFFFFFFE" },
    { value: -562949953421311n, expected: "010000000000FE" },
    { value: -562949953421312n, expected: "000000000000FE" },
    { value: -562949953421313n, expected: "FFFFFFFFFFFFFD" },
    { value: -1125899906842623n, expected: "010000000000FC" },
    { value: -1125899906842624n, expected: "000000000000FC" },
    { value: -1125899906842625n, expected: "FFFFFFFFFFFFFB" },
    { value: -2251799813685247n, expected: "010000000000F8" },
    { value: -2251799813685248n, expected: "000000000000F8" },
    { value: -2251799813685249n, expected: "FFFFFFFFFFFFF7" },
    { value: -4503599627370495n, expected: "010000000000F0" },
    { value: -4503599627370496n, expected: "000000000000F0" },
    { value: -4503599627370497n, expected: "FFFFFFFFFFFFEF" },
    { value: -9007199254740991n, expected: "010000000000E0" },
    { value: -9007199254740992n, expected: "000000000000E0" },
    { value: -9007199254740993n, expected: "FFFFFFFFFFFFDF" },
    { value: -18014398509481983n, expected: "010000000000C0" },
    { value: -18014398509481984n, expected: "000000000000C0" },
    { value: -18014398509481985n, expected: "FFFFFFFFFFFFBF" },
    { value: -36028797018963967n, expected: "01000000000080" },
    { value: -36028797018963968n, expected: "00000000000080" },
    { value: -36028797018963969n, expected: "FFFFFFFFFFFF7FFF" },
    { value: -72057594037927935n, expected: "01000000000000FF" },
    { value: -72057594037927936n, expected: "00000000000000FF" },
    { value: -72057594037927937n, expected: "FFFFFFFFFFFFFFFE" },
    { value: -144115188075855871n, expected: "01000000000000FE" },
    { value: -144115188075855872n, expected: "00000000000000FE" },
    { value: -144115188075855873n, expected: "FFFFFFFFFFFFFFFD" },
    { value: -288230376151711743n, expected: "01000000000000FC" },
    { value: -288230376151711744n, expected: "00000000000000FC" },
    { value: -288230376151711745n, expected: "FFFFFFFFFFFFFFFB" },
    { value: -576460752303423487n, expected: "01000000000000F8" },
    { value: -576460752303423488n, expected: "00000000000000F8" },
    { value: -576460752303423489n, expected: "FFFFFFFFFFFFFFF7" },
    { value: -1152921504606846975n, expected: "01000000000000F0" },
    { value: -1152921504606846976n, expected: "00000000000000F0" },
    { value: -1152921504606846977n, expected: "FFFFFFFFFFFFFFEF" },
    { value: -2305843009213693951n, expected: "01000000000000E0" },
    { value: -2305843009213693952n, expected: "00000000000000E0" },
    { value: -2305843009213693953n, expected: "FFFFFFFFFFFFFFDF" },
    { value: -4611686018427387903n, expected: "01000000000000C0" },
    { value: -4611686018427387904n, expected: "00000000000000C0" },
    { value: -4611686018427387905n, expected: "FFFFFFFFFFFFFFBF" },
    { value: -9223372036854775807n, expected: "0100000000000080" },
    { value: -9223372036854775808n, expected: "0000000000000080" },
    { value: -9223372036854775809n, expected: "FFFFFFFFFFFFFF7FFF" },
    { value: -18446744073709551615n, expected: "0100000000000000FF" },
    { value: -18446744073709551616n, expected: "0000000000000000FF" },
    { value: -18446744073709551617n, expected: "FFFFFFFFFFFFFFFFFE" },
]

describe('bigIntToByteArray', () => {

    function testConvertInt(value: bigint, expected: string) {
        it(`${value}`, () => {

            const bufferExpected = Buffer.from(expected, 'hex');
            expect(bigIntToByteArray(value)).to.deep.equal(bufferExpected);
        })
    }

    positiveValueTests.forEach(v => testConvertInt(v.value, v.expected));
    negativeValueTests.forEach(v => testConvertInt(v.value, v.expected));
});

describe('byteArrayToBigInt', () => {

    function testConvertBuffer(value: bigint, expected: string) {
        it(`0x${expected} -> ${value}`, () => {

            const buffer = Buffer.from(expected, 'hex');
            expect(byteArrayToBigInt(buffer)).to.equal(value);
        })
    }

    positiveValueTests.forEach(v => testConvertBuffer(v.value, v.expected));
    // negativeValueTests.forEach(v => testConvertBuffer(v.value, v.expected));
});

